#!/usr/bin/env bash
set -euo pipefail

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Installing via Termux pkg..."
  pkg install -y nodejs
fi

if [ ! -f .env ]; then
  cp .env.example .env
fi

mkdir -p data storage/files

echo "Starting Catbox-style host on http://localhost:3000"
node src/server.js
