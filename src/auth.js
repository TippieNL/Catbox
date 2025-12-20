const crypto = require('node:crypto');
const { readDb, writeDb, nextId } = require('./db');
const { SESSION_SECRET } = require('./config');

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const derived = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(derived, 'hex'));
}

function createUser(email, password) {
  const db = readDb();
  if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error('Email already registered');
  }
  const user = {
    id: nextId(db.users),
    email,
    password: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  writeDb(db);
  return user;
}

function authenticate(email, password) {
  const db = readDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return null;
  if (!verifyPassword(password, user.password)) return null;
  return user;
}

function createSessionToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(token).digest('hex');
  const value = `${token}.${signature}`;
  const db = readDb();
  db.tokens = db.tokens.filter((t) => t.userId !== userId);
  db.tokens.push({ token: value, userId, createdAt: new Date().toISOString() });
  writeDb(db);
  return value;
}

function verifySessionToken(token) {
  if (!token) return null;
  const [raw, signature] = token.split('.');
  if (!raw || !signature) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(raw).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))) return null;
  const db = readDb();
  const session = db.tokens.find((t) => t.token === token);
  if (!session) return null;
  const user = db.users.find((u) => u.id === session.userId);
  return user || null;
}

function clearSession(token) {
  const db = readDb();
  db.tokens = db.tokens.filter((t) => t.token !== token);
  writeDb(db);
}

module.exports = {
  hashPassword,
  verifyPassword,
  createUser,
  authenticate,
  createSessionToken,
  verifySessionToken,
  clearSession,
};
