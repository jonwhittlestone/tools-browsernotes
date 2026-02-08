# Browser Notes

A note-taking tool that works both as a Chrome extension (replacing your new tab page) and as a web app accessible from mobile browsers. Features automatic saving, Dropbox sync, Vim mode, mobile-friendly task view, and a clean dark interface.

## Features

- **Instant Access** - Chrome extension replaces new tab; web version at howapped.zapto.org/browsernotes
- **Auto-Save** - Notes saved automatically as you type
- **Dropbox Sync** - Sync across devices (extension uses direct OAuth, web version proxies through backend)
- **Mobile Task View** - Google Keep-style cards with checkboxes, inline editing, drag-to-reorder
- **Dark Theme** - Consistent dark UI across extension and web
- **Vim Mode** - Desktop-only, for keyboard enthusiasts with full undo/redo
- **Date Templates** - Quick journaling entries
- **Task Archiving** - Automatically archive completed tasks

## Architecture

The project has two interfaces sharing code where possible:

```
browser-notes/
├── src/                  # Chrome extension source (TypeScript)
│   ├── NotesApp.ts       # Core note-taking logic
│   ├── VimMode.ts        # Vim keybindings (shared with web)
│   ├── DropboxService.ts # Direct Dropbox API (extension)
│   └── ...
├── web/                  # Web frontend (TypeScript)
│   ├── app.ts            # WebNotesApp - web equivalent of NotesApp
│   ├── TaskView.ts       # Mobile card-based task interface
│   ├── MarkdownParser.ts # Parse/serialize markdown for task view
│   ├── SettingsPanel.ts  # Dropbox config, sync, Vim toggle
│   ├── WebDropboxClient.ts # Fetch client for backend proxy
│   └── index.html        # Main page
├── server/               # FastAPI backend (Python)
│   ├── main.py           # Routes, static file serving, auth
│   ├── auth.py           # Session cookie auth (90-day expiry)
│   ├── dropbox_proxy.py  # Dropbox OAuth + API proxy
│   └── config.py         # Environment config
├── tests/                # Python backend tests (pytest)
├── deploy/               # Deployment configs
│   └── podman-pi/        # Podman on Raspberry Pi
├── Containerfile         # Multi-stage build (Node + Python)
└── webpack.config.js     # Bundles both extension and web entries
```

## Quick Start

### Chrome Extension

```bash
npm install
npm run build

# Load in Chrome:
# 1. Open chrome://extensions/
# 2. Enable "Developer mode"
# 3. Click "Load unpacked"
# 4. Select this directory
```

### Web Version (Development)

```bash
# Frontend
npm install
npm run build
npm run build -- --watch   # Or use --watch for auto-rebuild on changes

# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r server/requirements.txt

# Set environment variables
export AUTH_PASSWORD=dev-password
export SECRET_KEY=$(python -c "import secrets; print(secrets.token_hex(32))")
export DROPBOX_APP_KEY=your-app-key

# Run
uvicorn server.main:app --reload --port 3004
```

### Web Version (Production / Podman)

```bash
cd deploy/podman-pi
cp .env.example .env
# Edit .env with real values
./deploy-doylestonex.sh
```

## Testing

```bash
# Frontend tests (Vitest, 58 tests)
npm test

# Backend tests (pytest, 21 tests)
source .venv/bin/activate
pytest tests/ -v

# All tests
npm test && pytest tests/ -v
```

**Test coverage:**
- Core app functionality (note saving, loading, UI)
- Vim mode (all commands including undo/redo)
- Retry logic (network resilience)
- Markdown parser (parsing, serialization, round-tripping)
- Backend auth (login, logout, session persistence, protected routes)
- Dropbox proxy (OAuth flow, CRUD operations, auth enforcement)

**Pre-commit hooks:**
- Husky runs tests before each commit
- Commits are blocked if any tests fail

## Keyboard Shortcuts

### Standard Mode
- `Ctrl/Cmd + S` - Manual sync (when Dropbox enabled)

### Vim Mode (desktop only, when enabled)
- `i` - Insert mode
- `Esc` - Normal mode
- `dd` - Delete line
- `u` / `U` - Undo / Redo
- `yy` - Copy line
- `p` / `P` - Paste after/before cursor

## Deployment

The web version deploys to a Raspberry Pi (doylestonex) via Podman behind Traefik:

- **Port**: 3004
- **URL**: https://howapped.zapto.org/browsernotes
- **Auth**: Password-based with 90-day session cookie
- **Container**: Multi-stage build (Node for frontend, Python for backend)
- **Traefik**: Path-based routing with `/browsernotes` prefix stripping
