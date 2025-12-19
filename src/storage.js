const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { FILE_DIR, MAX_FILE_SIZE_BYTES, DENY_EXTENSIONS } = require('./config');

function ensureStorage() {
  if (!fs.existsSync(FILE_DIR)) {
    fs.mkdirSync(FILE_DIR, { recursive: true });
  }
}

function isDenied(filename) {
  const ext = path.extname(filename || '').toLowerCase();
  return DENY_EXTENSIONS.includes(ext);
}

function saveFile(filename, buffer) {
  ensureStorage();
  const ext = path.extname(filename);
  const safeExt = ext.slice(0, 12);
  const randomName = `${crypto.randomBytes(12).toString('hex')}${safeExt}`;
  const target = path.join(FILE_DIR, randomName);
  fs.writeFileSync(target, buffer);
  return { storedName: randomName, path: target };
}

function deleteFile(storedName) {
  const target = path.join(FILE_DIR, storedName);
  if (fs.existsSync(target)) fs.unlinkSync(target);
}

function validateFile({ filename, size }) {
  if (size > MAX_FILE_SIZE_BYTES) {
    return `File exceeds max size of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`;
  }
  if (isDenied(filename)) {
    return 'This file type is not allowed';
  }
  return null;
}

module.exports = {
  saveFile,
  deleteFile,
  validateFile,
  isDenied,
  ensureStorage,
};
