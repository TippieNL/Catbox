const path = require('node:path');

const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB || 200);
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
const FILE_DIR = path.resolve(process.env.FILE_DIR || path.join(__dirname, '..', 'storage', 'files'));
const DENY_EXTENSIONS = (process.env.DENY_EXTENSIONS || '.exe,.bat,.cmd,.sh').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';

module.exports = {
  MAX_FILE_SIZE_BYTES: MAX_FILE_SIZE_MB * 1024 * 1024,
  MAX_FILE_SIZE_MB,
  DATA_DIR,
  FILE_DIR,
  DENY_EXTENSIONS,
  SESSION_SECRET,
};
