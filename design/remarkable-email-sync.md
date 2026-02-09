# Remarkable Email Sync

## Overview

Automate the transfer of handwritten notes sent from a reMarkable tablet via email to Dropbox. The reMarkable sends notes to a Dropbox email address, which deposits them in the `Email Attachments` folder. This feature monitors that source folder and copies new files to a configurable destination folder.

## User Flow

1. User writes a note on their reMarkable tablet
2. User shares the note via email to their Dropbox email address
3. Dropbox places the file in `/Email Attachments`
4. Browser Notes detects the new file and copies it to the destination folder
5. User sees sync activity and history in a new UI panel

## Architecture

### Backend: New FastAPI Router

New file: `server/remarkable_sync.py` — mounted at `/api/remarkable`

Reuses the existing Dropbox OAuth tokens and `_dropbox_request` helper from `server/dropbox_proxy.py`. No additional Dropbox auth is needed.

### Configuration

Stored alongside existing Dropbox config in `{DATA_DIR}/dropbox_tokens.json` under new keys:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "file_path": "/notes.md",
  "remarkable_sync": {
    "enabled": false,
    "source_folder": "/Email Attachments",
    "dest_folder": "/DropsyncFiles/jw-mind/_remarkable-emails-via-browsernotes",
    "poll_interval_seconds": 300,
    "last_sync_cursor": null,
    "sync_log": []
  }
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `false` | Master on/off toggle |
| `source_folder` | `/Email Attachments` | Dropbox folder where email attachments land |
| `dest_folder` | `/DropsyncFiles/jw-mind/_remarkable-emails-via-browsernotes` | Dropbox folder to copy files into |
| `poll_interval_seconds` | `300` (5 min) | How often the background task checks for new files |
| `last_sync_cursor` | `null` | Dropbox `list_folder/continue` cursor for incremental polling |
| `sync_log` | `[]` | Recent sync history (last 50 entries) |

### Sync Log Entry Format

```json
{
  "timestamp": "2026-02-09T14:30:00Z",
  "file_name": "Quick sheets.pdf",
  "source_path": "/Email Attachments/Quick sheets.pdf",
  "dest_path": "/DropsyncFiles/jw-mind/_remarkable-emails-via-browsernotes/Quick sheets.pdf",
  "status": "copied",
  "size_bytes": 245760
}
```

Status values: `copied`, `skipped` (already exists), `error`

## API Endpoints

All endpoints require session auth (same as existing Dropbox routes).

### `GET /api/remarkable/status`

Returns current sync configuration and recent activity.

**Response:**
```json
{
  "enabled": true,
  "source_folder": "/Email Attachments",
  "dest_folder": "/DropsyncFiles/jw-mind/_remarkable-emails-via-browsernotes",
  "poll_interval_seconds": 300,
  "last_sync": "2026-02-09T14:30:00Z",
  "recent_syncs": [
    {
      "timestamp": "2026-02-09T14:30:00Z",
      "file_name": "Quick sheets.pdf",
      "status": "copied",
      "size_bytes": 245760
    }
  ]
}
```

### `POST /api/remarkable/config`

Update sync settings.

**Request body:**
```json
{
  "enabled": true,
  "source_folder": "/Email Attachments",
  "dest_folder": "/DropsyncFiles/jw-mind/_remarkable-emails-via-browsernotes",
  "poll_interval_seconds": 300
}
```

All fields optional — only provided fields are updated.

### `POST /api/remarkable/sync`

Trigger an immediate sync (manual trigger, independent of polling).

**Response:**
```json
{
  "files_copied": 2,
  "files_skipped": 0,
  "errors": [],
  "details": [
    {
      "file_name": "Quick sheets.pdf",
      "status": "copied",
      "size_bytes": 245760
    }
  ]
}
```

### `GET /api/remarkable/log`

Return the full sync log (last 50 entries).

## Sync Logic

### Polling Strategy

Use Dropbox's `list_folder` with a stored cursor for efficient incremental polling:

1. **First run (no cursor):** Call `files/list_folder` on the source folder. Process all file entries. Store the returned cursor.
2. **Subsequent runs:** Call `files/list_folder/continue` with the stored cursor. Only new/changed entries are returned. Update the cursor.
3. If the cursor expires (HTTP 409 with `reset` tag), fall back to a full `list_folder` scan.

### Copy Procedure (per file)

For each new file detected in the source folder:

1. Check if a file with the same name already exists at the destination path using `files/get_metadata`. If it exists, log as `skipped`.
2. Use the Dropbox `files/copy_v2` API to copy the file server-side (no download/re-upload needed — this is a Dropbox-internal copy, fast and bandwidth-free):
   ```
   POST https://api.dropboxapi.com/2/files/copy_v2
   {
     "from_path": "/Email Attachments/Quick sheets.pdf",
     "to_path": "/DropsyncFiles/jw-mind/_remarkable-emails-via-browsernotes/Quick sheets.pdf",
     "autorename": true
   }
   ```
3. Log the result in `sync_log`.
4. Cap `sync_log` at 50 entries (drop oldest).

### Background Task

Use `asyncio.create_task` launched at startup in `server/main.py`:

```python
@app.on_event("startup")
async def start_remarkable_sync():
    asyncio.create_task(remarkable_sync_loop())
```

The loop:
```
while True:
    if enabled and dropbox_connected:
        run sync
    await asyncio.sleep(poll_interval_seconds)
```

The loop reads `enabled` and `poll_interval_seconds` from config on each iteration so changes take effect without restart.

### Destination Folder Creation

On first sync, attempt to create the destination folder via `files/create_folder_v2`. Ignore 409 (already exists).

## Frontend

### Settings Panel Addition

Add a "reMarkable Sync" section to the existing `SettingsPanel.ts`, below the Dropbox sync settings. Only visible when Dropbox is connected.

**UI Elements:**

```
reMarkable Sync
─────────────────────────────────
[Toggle] Enable sync              [ON/OFF]

Source folder    [/Email Attachments        ] [Browse]
Dest folder      [/DropsyncFiles/jw-mind/...] [Browse]
Poll interval    [5 min ▼]

[Sync Now]

Recent Activity
───────────────
  14:30  Quick sheets.pdf          copied   240KB
  14:30  Meeting notes.pdf         copied   180KB
  13:00  Sketch.pdf                skipped
```

- **Browse buttons** reuse the existing Dropbox folder browser from the notes file picker (adapted for folder selection)
- **Sync Now** calls `POST /api/remarkable/sync` and refreshes the activity list
- **Recent Activity** shows last 10 entries from `GET /api/remarkable/log`, auto-refreshes on panel open

### WebDropboxClient Extension

Add methods to `web/WebDropboxClient.ts`:

```typescript
getRemarkableStatus(): Promise<RemarkableSyncStatus>
saveRemarkableConfig(config: Partial<RemarkableSyncConfig>): Promise<void>
triggerRemarkableSync(): Promise<RemarkableSyncResult>
getRemarkableSyncLog(): Promise<SyncLogEntry[]>
```

## File Changes Summary

| File | Change |
|------|--------|
| `server/remarkable_sync.py` | **New** — sync router + background loop |
| `server/main.py` | Mount new router, start background task |
| `server/config.py` | Add default config constants |
| `web/WebDropboxClient.ts` | Add remarkable API methods |
| `web/SettingsPanel.ts` | Add remarkable sync UI section |
| `tests/test_remarkable_sync.py` | **New** — pytest tests for sync endpoints |
| `web/__tests__/SettingsPanel.test.ts` | New tests for remarkable UI (if test file exists) |

## Testing

### Backend (pytest)

- `test_remarkable_status` — returns config and log
- `test_remarkable_config_update` — saves settings, validates fields
- `test_remarkable_sync_copies_new_files` — mocks Dropbox list+copy, verifies copy calls and log entries
- `test_remarkable_sync_skips_existing` — file already at dest, logged as skipped
- `test_remarkable_sync_handles_cursor_reset` — 409 on continue, falls back to full list
- `test_remarkable_sync_creates_dest_folder` — first run creates folder
- `test_remarkable_sync_requires_auth` — all endpoints return 401 without session
- `test_remarkable_sync_requires_dropbox` — returns error when Dropbox not connected

### Frontend (vitest)

- Settings panel renders remarkable section when Dropbox connected
- Toggle sends config update
- Sync Now button triggers sync and refreshes log
- Recent activity displays log entries

## Edge Cases

- **Source folder doesn't exist:** Log error, don't crash the loop. User may not have received any emails yet.
- **Dest folder doesn't exist:** Auto-create on first sync.
- **Duplicate filenames with `autorename: true`:** If a same-named file exists at dest, Dropbox will append ` (1)` etc. The `skipped` check (via `get_metadata`) prevents this for exact matches, but `autorename` is a safety net.
- **Large files:** `copy_v2` is server-side so no memory/bandwidth concern.
- **Rate limiting:** The existing `_dropbox_request` helper handles 401 token refresh. Add a simple retry with backoff for 429 (rate limit) responses.
- **App restart:** Cursor is persisted in config file. Sync resumes from where it left off.
- **Dropbox disconnected mid-sync:** The sync loop checks `dropbox_connected` each iteration.

## Security

- All endpoints behind existing session auth
- No new secrets or credentials required (reuses Dropbox OAuth)
- No file content passes through the server (server-side Dropbox copy)
- Folder paths are validated to prevent path traversal (must start with `/`)

## Future Considerations (out of scope)

- Delete source files after successful copy (cleanup mode)
- Filter by file type (e.g., only `.pdf`)
- Webhook-based push instead of polling (requires public endpoint for Dropbox webhooks)
- Notification when new files are synced (browser push notification via service worker)
