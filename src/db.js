const fs = require('node:fs');
const path = require('node:path');
const { DATA_DIR } = require('./config');

const DB_PATH = path.join(DATA_DIR, 'db.json');

function ensureDirectories() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function init() {
  ensureDirectories();
  if (!fs.existsSync(DB_PATH)) {
    const initial = {
      users: [],
      files: [],
      shortLinks: [],
      albums: [],
      tokens: [],
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
  }
}

function readDb() {
  init();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  const data = JSON.parse(raw);
  if (!data.albums) {
    data.albums = [];
    writeDb(data);
  }
  return data;
}

function writeDb(data) {
  ensureDirectories();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function nextId(collection) {
  if (!collection.length) return 1;
  return Math.max(...collection.map((item) => item.id)) + 1;
}

module.exports = {
  readDb,
  writeDb,
  nextId,
  DB_PATH,
};
