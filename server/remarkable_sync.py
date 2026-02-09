import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from server.auth import is_authenticated
from server.config import DATA_DIR
from server.dropbox_proxy import _dropbox_request, _load_tokens, _save_tokens

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


async def _file_exists_at_dest(tokens: dict, path: str) -> bool:
    """Check if a file already exists at the destination path."""
    response = await _dropbox_request(
        "POST",
        "https://api.dropboxapi.com/2/files/get_metadata",
        tokens,
        json={"path": path},
    )
    return response.status_code == 200


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

    # Copy each new file
    now = datetime.now(timezone.utc).isoformat()
    for entry in entries:
        file_name = entry["name"]
        source_path = entry["path_display"]
        dest_path = f"{dest}/{file_name}"
        size_bytes = entry.get("size", 0)

        try:
            if await _file_exists_at_dest(tokens, dest_path):
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
                await _copy_file(tokens, source_path, dest_path)
                log_entry = {
                    "timestamp": now,
                    "file_name": file_name,
                    "source_path": source_path,
                    "dest_path": dest_path,
                    "status": "copied",
                    "size_bytes": size_bytes,
                }
                _add_log_entry(config, log_entry)
                results["files_copied"] += 1
                results["details"].append(
                    {"file_name": file_name, "status": "copied", "size_bytes": size_bytes}
                )
                logger.info("Copied %s -> %s", source_path, dest_path)
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
