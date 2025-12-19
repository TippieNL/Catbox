# Catbox-style Host

Lightweight Node-powered recreation of catbox.moe with anonymous uploads, optional accounts, temporary uploads, and a built-in link shortener. The stack avoids external dependencies for easier bootstrapping in constrained environments.

## Features
- Anonymous file uploads with direct links and delete tokens.
- Temporary uploads with 1h/12h/24h/72h expirations and automatic cleanup.
- Simple session-based accounts for dashboards, stats, and short-link history.
- Link shortener with redirects at `/s/:code`.
- JSON-based storage layer to avoid database setup; swap out `src/db.js` for a real database later.
- Modern responsive UI with dark mode, drag-and-drop upload, copy buttons, and FAQ/Tools/Contact/Legal/API docs pages.

## Getting started
1. Install Node 18+.
2. Copy `.env.example` to `.env` if you want custom settings, or rely on defaults.
3. Install dependencies (none required beyond Node built-ins).
4. Run the server:
   ```bash
   node src/server.js
   ```
5. Open http://localhost:3000 to use the app.

## Termux quick start (Android)
1. Clone the repo on your device.
2. From the project root, run:
   ```bash
   ./termux-start.sh
   ```
   The script installs Node.js if needed, initializes `.env`, prepares storage folders, and starts the server.

## Configuration
Environment variables:
- `PORT` (default: 3000)
- `MAX_FILE_SIZE_MB` (default: 200)
- `DATA_DIR` (default: `./data`)
- `FILE_DIR` (default: `./storage/files`)
- `DENY_EXTENSIONS` (default: `.exe,.bat,.cmd,.sh`)
- `SESSION_SECRET` (default: development secret, change in production)

## API quick reference
- `POST /api/upload` – body `{ filename, content: base64String, temporary?: boolean, expiryHours?: number }`
- `POST /api/delete` – body `{ fileId, deleteToken }` (or authenticated owner)
- `POST /api/register` – `{ email, password }`
- `POST /api/login` – `{ email, password }`
- `POST /api/logout`
- `GET /api/me` – returns user, files, links
- `POST /shorten` – `{ url }`

## Notes
- Uploads and sessions are stored in JSON on disk. Replace `src/db.js` with a real database adapter for production.
- Upload API expects base64 payloads to avoid multipart parsing dependencies; the UI handles conversion automatically.
- Static assets live in `public/` and are served directly.
