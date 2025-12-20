const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const crypto = require('node:crypto');
const { MAX_FILE_SIZE_BYTES } = require('./config');
const { readDb, writeDb, nextId } = require('./db');
const { saveFile, deleteFile, validateFile, ensureStorage } = require('./storage');
const {
  createUser,
  authenticate,
  createSessionToken,
  verifySessionToken,
  clearSession,
} = require('./auth');

ensureStorage();

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  return Object.fromEntries(header.split(';').map((c) => c.trim().split('=').map(decodeURIComponent)).filter(([k]) => k));
}

function serveStatic(req, res) {
  const parsed = url.parse(req.url);
  let pathname = parsed.pathname;
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(PUBLIC_DIR, pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    stream.pipe(res);
    return true;
  }
  return false;
}

function serveStoredFile(req, res) {
  const parsed = url.parse(req.url);
  if (!parsed.pathname.startsWith('/files/')) return false;
  const filename = parsed.pathname.replace('/files/', '');
  const target = path.join(require('./config').FILE_DIR, filename);
  if (!target.startsWith(require('./config').FILE_DIR)) return false;
  if (fs.existsSync(target)) {
    const stream = fs.createReadStream(target);
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    stream.pipe(res);
    return true;
  }
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > MAX_FILE_SIZE_BYTES * 3) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function cleanupExpired() {
  const db = readDb();
  const now = Date.now();
  const aliveFiles = [];
  for (const file of db.files) {
    if (file.expiresAt && new Date(file.expiresAt).getTime() < now) {
      deleteFile(file.storedName);
      continue;
    }
    aliveFiles.push(file);
  }
  db.files = aliveFiles;
  writeDb(db);
}

function requireAuth(req) {
  const cookies = parseCookies(req);
  const token = cookies['session'];
  return verifySessionToken(token);
}

function handleApi(req, res, parsed) {
  if (req.method === 'POST' && parsed.pathname === '/api/register') {
    return readBody(req)
      .then(({ email, password }) => {
        if (!email || !password) return send(res, 400, { error: 'Email and password required' });
        const user = createUser(email, password);
        const token = createSessionToken(user.id);
        send(res, 201, { user: { id: user.id, email: user.email } }, { 'Set-Cookie': `session=${token}; HttpOnly; Path=/` });
      })
      .catch((err) => send(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && parsed.pathname === '/api/login') {
    return readBody(req)
      .then(({ email, password }) => {
        const user = authenticate(email || '', password || '');
        if (!user) return send(res, 401, { error: 'Invalid credentials' });
        const token = createSessionToken(user.id);
        send(res, 200, { user: { id: user.id, email: user.email } }, { 'Set-Cookie': `session=${token}; HttpOnly; Path=/` });
      })
      .catch((err) => send(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && parsed.pathname === '/api/logout') {
    const cookies = parseCookies(req);
    const token = cookies['session'];
    if (token) clearSession(token);
    return send(res, 204, '', { 'Set-Cookie': 'session=; Max-Age=0; Path=/' });
  }

  if (req.method === 'GET' && parsed.pathname === '/api/me') {
    const user = requireAuth(req);
    if (!user) return send(res, 401, { error: 'Unauthorized' });
    const db = readDb();
    const files = db.files.filter((f) => f.userId === user.id);
    const links = db.shortLinks.filter((l) => l.userId === user.id);
    return send(res, 200, { user: { id: user.id, email: user.email }, files, links });
  }

  if (req.method === 'GET' && parsed.pathname === '/api/albums') {
    const user = requireAuth(req);
    if (!user) return send(res, 401, { error: 'Unauthorized' });
    const db = readDb();
    const albums = db.albums.filter((album) => album.ownerUserId === user.id);
    return send(res, 200, { albums });
  }

  if (req.method === 'POST' && parsed.pathname === '/api/albums') {
    const user = requireAuth(req);
    if (!user) return send(res, 401, { error: 'Unauthorized' });
    return readBody(req)
      .then(({ title, description, fileIds }) => {
        const db = readDb();
        const now = new Date().toISOString();
        const record = {
          id: nextId(db.albums),
          title: title || '',
          description: description || '',
          fileIds: Array.isArray(fileIds) ? fileIds : [],
          ownerUserId: user.id,
          createdAt: now,
          updatedAt: now,
        };
        db.albums.push(record);
        writeDb(db);
        return send(res, 201, { album: record });
      })
      .catch((err) => send(res, 400, { error: err.message }));
  }

  if (req.method === 'PUT' && parsed.pathname.startsWith('/api/albums/')) {
    const user = requireAuth(req);
    if (!user) return send(res, 401, { error: 'Unauthorized' });
    const id = Number(parsed.pathname.replace('/api/albums/', ''));
    if (!Number.isInteger(id)) return send(res, 400, { error: 'Invalid album id' });
    return readBody(req)
      .then(({ title, description, fileIds }) => {
        const db = readDb();
        const album = db.albums.find((item) => item.id === id);
        if (!album) return send(res, 404, { error: 'Album not found' });
        if (album.ownerUserId !== user.id) return send(res, 403, { error: 'Forbidden' });
        if (title !== undefined) album.title = title;
        if (description !== undefined) album.description = description;
        if (fileIds !== undefined) album.fileIds = Array.isArray(fileIds) ? fileIds : album.fileIds;
        album.updatedAt = new Date().toISOString();
        writeDb(db);
        return send(res, 200, { album });
      })
      .catch((err) => send(res, 400, { error: err.message }));
  }

  if (req.method === 'DELETE' && parsed.pathname.startsWith('/api/albums/')) {
    const user = requireAuth(req);
    if (!user) return send(res, 401, { error: 'Unauthorized' });
    const id = Number(parsed.pathname.replace('/api/albums/', ''));
    if (!Number.isInteger(id)) return send(res, 400, { error: 'Invalid album id' });
    const db = readDb();
    const albumIndex = db.albums.findIndex((item) => item.id === id);
    if (albumIndex === -1) return send(res, 404, { error: 'Album not found' });
    if (db.albums[albumIndex].ownerUserId !== user.id) return send(res, 403, { error: 'Forbidden' });
    const [removed] = db.albums.splice(albumIndex, 1);
    writeDb(db);
    return send(res, 200, { ok: true, album: removed });
  }

  if (req.method === 'POST' && parsed.pathname === '/api/upload') {
    return readBody(req)
      .then(({ filename, content, temporary = false, expiryHours }) => {
        const buffer = Buffer.from(content || '', 'base64');
        const error = validateFile({ filename, size: buffer.length });
        if (error) return send(res, 400, { error });
        const user = requireAuth(req);
        const { storedName } = saveFile(filename, buffer);
        const db = readDb();
        const id = nextId(db.files);
        const expiresAt = temporary && expiryHours ? new Date(Date.now() + Number(expiryHours) * 3600 * 1000).toISOString() : null;
        const deleteToken = crypto.randomBytes(12).toString('hex');
        const record = {
          id,
          storedName,
          originalName: filename,
          size: buffer.length,
          userId: user ? user.id : null,
          isTemporary: Boolean(temporary),
          createdAt: new Date().toISOString(),
          expiresAt,
          deleteToken,
        };
        db.files.push(record);
        writeDb(db);
        const link = `${req.headers.origin || ''}/files/${storedName}`;
        send(res, 201, {
          id,
          file_url: link,
          delete_token: deleteToken,
          expires_at: expiresAt,
          size: buffer.length,
          original_name: filename,
        });
      })
      .catch((err) => send(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && parsed.pathname === '/api/delete') {
    return readBody(req)
      .then(({ fileId, deleteToken }) => {
        const db = readDb();
        const file = db.files.find((f) => f.id === Number(fileId));
        if (!file) return send(res, 404, { error: 'File not found' });
        const user = requireAuth(req);
        if (!(user && user.id === file.userId) && file.deleteToken !== deleteToken) {
          return send(res, 403, { error: 'Not allowed to delete' });
        }
        deleteFile(file.storedName);
        db.files = db.files.filter((f) => f.id !== file.id);
        writeDb(db);
        send(res, 200, { ok: true });
      })
      .catch((err) => send(res, 400, { error: err.message }));
  }

  if (req.method === 'POST' && parsed.pathname === '/shorten') {
    return readBody(req)
      .then(({ url: longUrl }) => {
        if (!longUrl) return send(res, 400, { error: 'URL required' });
        const db = readDb();
        const code = Math.random().toString(36).slice(2, 8);
        const user = requireAuth(req);
        const record = { id: nextId(db.shortLinks), code, originalUrl: longUrl, userId: user ? user.id : null, createdAt: new Date().toISOString() };
        db.shortLinks.push(record);
        writeDb(db);
        const shortUrl = `${req.headers.origin || ''}/s/${code}`;
        send(res, 201, { short_url: shortUrl, code });
      })
      .catch((err) => send(res, 400, { error: err.message }));
  }

  return false;
}

function handleShortRedirect(req, res, parsed) {
  if (parsed.pathname.startsWith('/s/')) {
    const code = parsed.pathname.replace('/s/', '');
    const db = readDb();
    const entry = db.shortLinks.find((l) => l.code === code);
    if (!entry) return send(res, 404, { error: 'Not found' });
    res.writeHead(302, { Location: entry.originalUrl });
    res.end();
    return true;
  }
  return false;
}

function router(req, res) {
  const parsed = url.parse(req.url);
  cleanupExpired();

  if (serveStoredFile(req, res)) return;
  if (handleShortRedirect(req, res, parsed)) return;
  if (parsed.pathname.startsWith('/api/') || parsed.pathname === '/shorten') {
    const handled = handleApi(req, res, parsed);
    if (handled !== false) return;
  }
  if (serveStatic(req, res)) return;
  sendHtml(res, 404, '<h1>Not found</h1>');
}

const PORT = process.env.PORT || 3000;
const server = http.createServer(router);
server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
