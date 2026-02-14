import asyncio
import json
import logging
import re
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from server.auth import is_authenticated
from server.config import DATA_DIR
from server.dropbox_proxy import _dropbox_request, _load_tokens, _save_tokens
from server.ocr import ocr_pdf

logger = logging.getLogger("remarkable_sync")

router = APIRouter(prefix="/api/remarkable")

DEFAULT_SOURCE = "/Email Attachments"
DEFAULT_DEST = "/DropsyncFiles/jw-mind/_remarkable-emails-via-browsernotes"
DEFAULT_POLL_INTERVAL = 300  # 5 minutes
MAX_LOG_ENTRIES = 50


def _require_auth(request: Request) -> JSONResponse | None:
    if not is_authenticated(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return None


def _get_remarkable_config(tokens: dict) -> dict:
    return tokens.get("remarkable_sync", {})


def _save_remarkable_config(tokens: dict, config: dict) -> None:
    tokens["remarkable_sync"] = config
    _save_tokens(tokens)


def _add_log_entry(config: dict, entry: dict) -> None:
    log = config.get("sync_log", [])
    log.insert(0, entry)
    config["sync_log"] = log[:MAX_LOG_ENTRIES]


def _extract_notebook_name(file_name: str) -> str:
    """Extract notebook name from a reMarkable file name.

    Examples:
        '~ focus ~ (12).pdf' -> 'focus'
        '~ focus ~.pdf' -> 'focus'
        '~ focus ~ - page 40.png' -> 'focus'
        'random (1).pdf' -> 'random'
        'random.pdf' -> 'random'
    """
    # Tilde-wrapped: ~ name ~
    m = re.match(r"^~\s*(.+?)\s*~", file_name)
    if m:
        return m.group(1).strip()
    # Plain name: strip copy suffix and extension
    name = re.sub(r"\s*\(\d+\)\s*", "", file_name)  # remove (N)
    name = re.sub(r"\s*-\s*page\s+\d+", "", name)  # remove - page N
    name = re.sub(r"\.[^.]+$", "", name)  # remove extension
    return name.strip()


def _daily_periodic(dt: datetime) -> str:
    """Build daily-periodic folder name like '2026-02-08-W06-Sat'."""
    iso_year, iso_week, _ = dt.isocalendar()
    return dt.strftime(f"%Y-%m-%d-W{iso_week:02d}-%a")


async def _ensure_folder_exists(tokens: dict, path: str) -> None:
    """Create destination folder if it doesn't exist."""
    try:
        await _dropbox_request(
            "POST",
            "https://api.dropboxapi.com/2/files/create_folder_v2",
            tokens,
            json={"path": path, "autorename": False},
        )
    except Exception:
        pass  # Folder may already exist (409) or other error


async def _get_dest_metadata(tokens: dict, path: str) -> dict | None:
    """Get metadata for a file at the destination path, or None if not found."""
    response = await _dropbox_request(
        "POST",
        "https://api.dropboxapi.com/2/files/get_metadata",
        tokens,
        json={"path": path},
    )
    if response.status_code == 200:
        return response.json()
    return None


async def _copy_file(tokens: dict, from_path: str, to_path: str) -> dict:
    """Copy a file within Dropbox (server-side, no download needed)."""
    response = await _dropbox_request(
        "POST",
        "https://api.dropboxapi.com/2/files/copy_v2",
        tokens,
        json={
            "from_path": from_path,
            "to_path": to_path,
            "autorename": True,
        },
    )
    if response.status_code != 200:
        raise Exception(f"Copy failed: {response.text}")
    return response.json()


async def _download_file(tokens: dict, path: str) -> bytes:
    """Download a file from Dropbox and return its bytes."""
    response = await _dropbox_request(
        "POST",
        "https://content.dropboxapi.com/2/files/download",
        tokens,
        headers={"Dropbox-API-Arg": json.dumps({"path": path})},
    )
    if response.status_code != 200:
        raise Exception(f"Download failed ({response.status_code}): {response.text}")
    return response.content


async def _upload_text(tokens: dict, path: str, content: str) -> None:
    """Upload a text string as a file to Dropbox."""
    await _dropbox_request(
        "POST",
        "https://content.dropboxapi.com/2/files/upload",
        tokens,
        headers={
            "Dropbox-API-Arg": json.dumps({
                "path": path,
                "mode": "overwrite",
                "autorename": False,
                "mute": True,
            }),
            "Content-Type": "application/octet-stream",
        },
        content=content.encode("utf-8"),
    )


PROGRESS_LOG_NAME = "_ocr-progress.log"
MAX_PROGRESS_LOG_LINES = 200


async def _append_progress_log(tokens: dict, dest_folder: str, message: str) -> None:
    """Append a timestamped line to the OCR progress log on Dropbox.

    The log file lives at {dest_folder}/_ocr-progress.log and is viewable
    from Obsidian, phone, or any Dropbox-synced device.
    """
    log_path = f"{dest_folder}/{PROGRESS_LOG_NAME}"
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    new_line = f"[{timestamp}] {message}"

    # Download existing log (or start fresh)
    try:
        existing = await _download_file(tokens, log_path)
        lines = existing.decode("utf-8", errors="replace").splitlines()
    except Exception:
        lines = []

    lines.append(new_line)
    # Cap at MAX_PROGRESS_LOG_LINES (keep most recent)
    lines = lines[-MAX_PROGRESS_LOG_LINES:]

    try:
        await _upload_text(tokens, log_path, "\n".join(lines) + "\n")
    except Exception:
        logger.warning("Failed to write progress log to %s", log_path)


async def _run_ocr_for_file(tokens: dict, dest_path: str, config: dict, now: str) -> None:
    """Download PDF from Dropbox, run OCR, upload .txt alongside it.

    Writes progress updates to _ocr-progress.log on Dropbox so the author
    can check status from Obsidian or any synced device.

    Runs in background — errors are logged but never propagate.
    """
    dest_folder = config.get("dest_folder", DEFAULT_DEST)
    file_name = dest_path.rsplit("/", 1)[-1]
    ocr_start = time.monotonic()

    try:
        logger.info("OCR starting for %s", dest_path)
        await _append_progress_log(tokens, dest_folder, f"{file_name} — OCR started")

        pdf_bytes = await _download_file(tokens, dest_path)

        # Build a progress callback that bridges the thread → async event loop
        loop = asyncio.get_event_loop()
        thresholds_logged = set()

        def progress_callback(lines_done: int, total_lines: int) -> None:
            if total_lines <= 0:
                return
            pct = int(lines_done / total_lines * 100)
            for threshold in (25, 50, 75):
                if pct >= threshold and threshold not in thresholds_logged:
                    thresholds_logged.add(threshold)
                    msg = f"{file_name} — {threshold}% ({lines_done}/{total_lines} lines)"
                    future = asyncio.run_coroutine_threadsafe(
                        _append_progress_log(tokens, dest_folder, msg), loop
                    )
                    try:
                        future.result(timeout=15)
                    except Exception:
                        pass  # Don't let log failure interrupt OCR

        # Run CPU-bound OCR in a thread to avoid blocking the event loop
        text = await loop.run_in_executor(
            None, lambda: ocr_pdf(pdf_bytes, progress_callback=progress_callback)
        )

        elapsed = time.monotonic() - ocr_start

        if text.strip():
            txt_path = dest_path.rsplit(".", 1)[0] + ".txt"
            await _upload_text(tokens, txt_path, text)
            n_lines = len(text.strip().split("\n"))
            logger.info("OCR complete: %s -> %s", dest_path, txt_path)

            txt_name = txt_path.rsplit("/", 1)[-1]
            await _append_progress_log(
                tokens, dest_folder,
                f"{file_name} — completed ({n_lines} lines, {elapsed:.1f}s) -> {txt_name}",
            )

            # Update the most recent log entry for this file
            log = config.get("sync_log", [])
            for entry in log:
                if entry.get("dest_path") == dest_path and entry.get("timestamp") == now:
                    entry["ocr_status"] = "completed"
                    entry["ocr_text_path"] = txt_path
                    entry["ocr_lines"] = n_lines
                    entry["ocr_duration_seconds"] = round(elapsed, 1)
                    break
            _save_remarkable_config(_load_tokens(), config)
        else:
            logger.warning("OCR produced no text for %s", dest_path)
            await _append_progress_log(
                tokens, dest_folder,
                f"{file_name} — completed (no text detected, {elapsed:.1f}s)",
            )
    except Exception as e:
        logger.exception("OCR failed for %s", dest_path)
        elapsed = time.monotonic() - ocr_start
        try:
            await _append_progress_log(
                tokens, dest_folder,
                f"{file_name} — error: {e} ({elapsed:.1f}s)",
            )
        except Exception:
            pass


async def run_sync(tokens: dict | None = None) -> dict:
    """Run one sync cycle: list source folder, copy new files to dest."""
    if tokens is None:
        tokens = _load_tokens()

    if not tokens.get("access_token"):
        return {"error": "not connected to Dropbox"}

    config = _get_remarkable_config(tokens)
    source = config.get("source_folder", DEFAULT_SOURCE)
    dest = config.get("dest_folder", DEFAULT_DEST)
    cursor = config.get("last_sync_cursor")

    results = {"files_copied": 0, "files_skipped": 0, "errors": [], "details": []}

    # Ensure destination folder exists
    await _ensure_folder_exists(tokens, dest)

    # List source folder (use cursor for incremental polling)
    entries = []
    if cursor:
        response = await _dropbox_request(
            "POST",
            "https://api.dropboxapi.com/2/files/list_folder/continue",
            tokens,
            json={"cursor": cursor},
        )
        # Cursor expired — fall back to full listing
        if response.status_code == 409:
            cursor = None

    if not cursor:
        response = await _dropbox_request(
            "POST",
            "https://api.dropboxapi.com/2/files/list_folder",
            tokens,
            json={
                "path": source,
                "recursive": False,
                "include_deleted": False,
            },
        )

    if response.status_code != 200:
        error_detail = response.text
        # Source folder may not exist yet (no emails received)
        if response.status_code == 409 and "not_found" in error_detail:
            logger.info("Source folder %s does not exist yet", source)
            return results
        results["errors"].append(f"Failed to list source folder: {error_detail}")
        return results

    data = response.json()
    entries = [e for e in data.get("entries", []) if e.get(".tag") == "file"]

    # Handle pagination
    while data.get("has_more"):
        response = await _dropbox_request(
            "POST",
            "https://api.dropboxapi.com/2/files/list_folder/continue",
            tokens,
            json={"cursor": data["cursor"]},
        )
        if response.status_code == 200:
            data = response.json()
            entries.extend(
                e for e in data.get("entries", []) if e.get(".tag") == "file"
            )
        else:
            break

    # Save cursor for next incremental poll
    new_cursor = data.get("cursor")
    if new_cursor:
        config["last_sync_cursor"] = new_cursor

    # Copy each new file into {dest}/{notebook}/{daily-periodic}/
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    daily = _daily_periodic(now_dt)
    for entry in entries:
        file_name = entry["name"]
        source_path = entry["path_display"]
        notebook = _extract_notebook_name(file_name)
        dest_folder = f"{dest}/{notebook}/{daily}"
        dest_path = f"{dest_folder}/{file_name}"
        size_bytes = entry.get("size", 0)

        try:
            dest_meta = await _get_dest_metadata(tokens, dest_path)
            dest_size = dest_meta.get("size", 0) if dest_meta else None
            size_changed = dest_meta is not None and dest_size != size_bytes

            if dest_meta and not size_changed:
                log_entry = {
                    "timestamp": now,
                    "file_name": file_name,
                    "source_path": source_path,
                    "dest_path": dest_path,
                    "status": "skipped",
                    "size_bytes": size_bytes,
                }
                _add_log_entry(config, log_entry)
                results["files_skipped"] += 1
                results["details"].append(
                    {"file_name": file_name, "status": "skipped", "size_bytes": size_bytes}
                )
            else:
                status = "copied (updated)" if size_changed else "copied"
                if size_changed:
                    logger.info(
                        "Size changed for %s: dest=%d src=%d",
                        file_name, dest_size, size_bytes,
                    )
                await _ensure_folder_exists(tokens, dest_folder)
                await _copy_file(tokens, source_path, dest_path)
                log_entry = {
                    "timestamp": now,
                    "file_name": file_name,
                    "source_path": source_path,
                    "dest_path": dest_path,
                    "status": status,
                    "size_bytes": size_bytes,
                }
                _add_log_entry(config, log_entry)
                results["files_copied"] += 1
                results["details"].append(
                    {"file_name": file_name, "status": status, "size_bytes": size_bytes}
                )
                logger.info("Copied %s -> %s", source_path, dest_path)

                # Trigger background OCR for PDF files
                if file_name.lower().endswith(".pdf") and config.get("ocr_enabled", True):
                    asyncio.create_task(
                        _run_ocr_for_file(tokens, dest_path, config, now)
                    )
        except Exception as e:
            log_entry = {
                "timestamp": now,
                "file_name": file_name,
                "source_path": source_path,
                "dest_path": dest_path,
                "status": "error",
                "size_bytes": size_bytes,
                "error": str(e),
            }
            _add_log_entry(config, log_entry)
            results["errors"].append(f"{file_name}: {e}")
            results["details"].append(
                {"file_name": file_name, "status": "error", "error": str(e)}
            )

    _save_remarkable_config(tokens, config)
    return results


async def remarkable_sync_loop() -> None:
    """Background loop that periodically syncs remarkable files."""
    logger.info("Remarkable sync background loop started")
    while True:
        try:
            tokens = _load_tokens()
            config = _get_remarkable_config(tokens)
            enabled = config.get("enabled", False)
            interval = config.get("poll_interval_seconds", DEFAULT_POLL_INTERVAL)

            if enabled and tokens.get("access_token"):
                logger.info("Running remarkable sync cycle")
                result = await run_sync(tokens)
                if result.get("files_copied"):
                    logger.info("Synced %d files", result["files_copied"])
                if result.get("errors"):
                    logger.warning("Sync errors: %s", result["errors"])
        except Exception:
            logger.exception("Remarkable sync loop error")

        # Re-read interval in case config changed
        try:
            tokens = _load_tokens()
            config = _get_remarkable_config(tokens)
            interval = config.get("poll_interval_seconds", DEFAULT_POLL_INTERVAL)
        except Exception:
            interval = DEFAULT_POLL_INTERVAL

        await asyncio.sleep(interval)


# --- Routes ---


@router.get("/status")
async def remarkable_status(request: Request):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    tokens = _load_tokens()
    config = _get_remarkable_config(tokens)
    log = config.get("sync_log", [])

    return {
        "enabled": config.get("enabled", False),
        "ocr_enabled": config.get("ocr_enabled", True),
        "source_folder": config.get("source_folder", DEFAULT_SOURCE),
        "dest_folder": config.get("dest_folder", DEFAULT_DEST),
        "poll_interval_seconds": config.get("poll_interval_seconds", DEFAULT_POLL_INTERVAL),
        "last_sync": log[0]["timestamp"] if log else None,
        "recent_syncs": log[:10],
    }


@router.post("/config")
async def remarkable_config(request: Request):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    body = await request.json()
    tokens = _load_tokens()
    config = _get_remarkable_config(tokens)

    if "enabled" in body:
        config["enabled"] = bool(body["enabled"])
    if "source_folder" in body:
        sf = body["source_folder"]
        if not sf.startswith("/"):
            return JSONResponse({"error": "source_folder must start with /"}, status_code=400)
        config["source_folder"] = sf
    if "dest_folder" in body:
        df = body["dest_folder"]
        if not df.startswith("/"):
            return JSONResponse({"error": "dest_folder must start with /"}, status_code=400)
        config["dest_folder"] = df
    if "poll_interval_seconds" in body:
        config["poll_interval_seconds"] = max(60, int(body["poll_interval_seconds"]))
    if "ocr_enabled" in body:
        config["ocr_enabled"] = bool(body["ocr_enabled"])

    # Reset cursor when folders change so next sync does a full scan
    if "source_folder" in body:
        config.pop("last_sync_cursor", None)

    _save_remarkable_config(tokens, config)
    return {"status": "saved"}


@router.post("/sync")
async def remarkable_sync_now(request: Request):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    tokens = _load_tokens()
    if not tokens.get("access_token"):
        return JSONResponse({"error": "not connected to Dropbox"}, status_code=400)

    result = await run_sync(tokens)
    return result


@router.get("/log")
async def remarkable_log(request: Request):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    tokens = _load_tokens()
    config = _get_remarkable_config(tokens)
    return {"entries": config.get("sync_log", [])}


@router.post("/ocr")
async def remarkable_ocr(request: Request):
    """Manually trigger OCR on a specific PDF file in Dropbox."""
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    body = await request.json()
    path = body.get("path", "")
    if not path or not path.lower().endswith(".pdf"):
        return JSONResponse({"error": "path must be a .pdf file"}, status_code=400)

    tokens = _load_tokens()
    if not tokens.get("access_token"):
        return JSONResponse({"error": "not connected to Dropbox"}, status_code=400)

    try:
        pdf_bytes = await _download_file(tokens, path)
    except Exception as e:
        return JSONResponse({"error": f"Failed to download: {e}"}, status_code=400)

    loop = asyncio.get_event_loop()
    text = await loop.run_in_executor(None, ocr_pdf, pdf_bytes)

    if not text.strip():
        return {"status": "completed", "text_path": None, "lines": 0, "text": ""}

    txt_path = path.rsplit(".", 1)[0] + ".txt"
    await _upload_text(tokens, txt_path, text)

    return {
        "status": "completed",
        "text_path": txt_path,
        "lines": len(text.strip().split("\n")),
        "text": text,
    }
