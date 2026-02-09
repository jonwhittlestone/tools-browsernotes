import json
import os
from unittest.mock import patch, AsyncMock

import httpx
import pytest

from server.config import DATA_DIR


TOKENS_FILE = os.path.join(DATA_DIR, "dropbox_tokens.json")


def _write_tokens(tokens: dict):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(TOKENS_FILE, "w") as f:
        json.dump(tokens, f)


def _cleanup_tokens():
    if os.path.exists(TOKENS_FILE):
        os.remove(TOKENS_FILE)


@pytest.fixture(autouse=True)
def clean_tokens():
    _cleanup_tokens()
    yield
    _cleanup_tokens()


def _base_tokens(**extra):
    tokens = {"access_token": "test-token", "refresh_token": "test-refresh"}
    tokens.update(extra)
    return tokens


# --- Auth tests ---


def test_remarkable_status_unauthenticated(client):
    response = client.get("/api/remarkable/status")
    assert response.status_code == 401


def test_remarkable_config_unauthenticated(client):
    response = client.post("/api/remarkable/config", json={"enabled": True})
    assert response.status_code == 401


def test_remarkable_sync_unauthenticated(client):
    response = client.post("/api/remarkable/sync")
    assert response.status_code == 401


def test_remarkable_log_unauthenticated(client):
    response = client.get("/api/remarkable/log")
    assert response.status_code == 401


def test_remarkable_all_routes_require_auth(client):
    routes = [
        ("GET", "/api/remarkable/status"),
        ("POST", "/api/remarkable/config"),
        ("POST", "/api/remarkable/sync"),
        ("GET", "/api/remarkable/log"),
    ]
    for method, path in routes:
        if method == "GET":
            response = client.get(path, follow_redirects=False)
        else:
            response = client.post(path, json={})
        assert response.status_code == 401, f"{method} {path} should require auth"


# --- Status ---


def test_remarkable_status_defaults(authed_client):
    _write_tokens(_base_tokens())
    response = authed_client.get("/api/remarkable/status")
    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is False
    assert data["source_folder"] == "/Email Attachments"
    assert data["dest_folder"] == "/DropsyncFiles/jw-mind/_remarkable-emails-via-browsernotes"
    assert data["poll_interval_seconds"] == 300
    assert data["last_sync"] is None
    assert data["recent_syncs"] == []


def test_remarkable_status_with_config(authed_client):
    _write_tokens(_base_tokens(remarkable_sync={
        "enabled": True,
        "source_folder": "/Custom Source",
        "dest_folder": "/Custom Dest",
        "poll_interval_seconds": 600,
        "sync_log": [
            {"timestamp": "2026-01-01T00:00:00Z", "file_name": "test.pdf", "status": "copied", "size_bytes": 100},
        ],
    }))
    response = authed_client.get("/api/remarkable/status")
    data = response.json()
    assert data["enabled"] is True
    assert data["source_folder"] == "/Custom Source"
    assert data["last_sync"] == "2026-01-01T00:00:00Z"
    assert len(data["recent_syncs"]) == 1


# --- Config ---


def test_remarkable_config_update(authed_client):
    _write_tokens(_base_tokens())
    response = authed_client.post("/api/remarkable/config", json={
        "enabled": True,
        "source_folder": "/New Source",
        "dest_folder": "/New Dest",
        "poll_interval_seconds": 600,
    })
    assert response.status_code == 200
    assert response.json()["status"] == "saved"

    with open(TOKENS_FILE) as f:
        tokens = json.load(f)
    config = tokens["remarkable_sync"]
    assert config["enabled"] is True
    assert config["source_folder"] == "/New Source"
    assert config["dest_folder"] == "/New Dest"
    assert config["poll_interval_seconds"] == 600


def test_remarkable_config_partial_update(authed_client):
    _write_tokens(_base_tokens(remarkable_sync={
        "enabled": False,
        "source_folder": "/Email Attachments",
        "dest_folder": "/Original Dest",
    }))
    response = authed_client.post("/api/remarkable/config", json={"enabled": True})
    assert response.status_code == 200

    with open(TOKENS_FILE) as f:
        tokens = json.load(f)
    config = tokens["remarkable_sync"]
    assert config["enabled"] is True
    assert config["dest_folder"] == "/Original Dest"  # unchanged


def test_remarkable_config_validates_source_path(authed_client):
    _write_tokens(_base_tokens())
    response = authed_client.post("/api/remarkable/config", json={"source_folder": "no-slash"})
    assert response.status_code == 400


def test_remarkable_config_validates_dest_path(authed_client):
    _write_tokens(_base_tokens())
    response = authed_client.post("/api/remarkable/config", json={"dest_folder": "no-slash"})
    assert response.status_code == 400


def test_remarkable_config_resets_cursor_on_source_change(authed_client):
    _write_tokens(_base_tokens(remarkable_sync={
        "source_folder": "/Old Source",
        "last_sync_cursor": "old-cursor-123",
    }))
    authed_client.post("/api/remarkable/config", json={"source_folder": "/New Source"})

    with open(TOKENS_FILE) as f:
        tokens = json.load(f)
    assert "last_sync_cursor" not in tokens["remarkable_sync"]


def test_remarkable_config_enforces_min_interval(authed_client):
    _write_tokens(_base_tokens())
    authed_client.post("/api/remarkable/config", json={"poll_interval_seconds": 10})

    with open(TOKENS_FILE) as f:
        tokens = json.load(f)
    assert tokens["remarkable_sync"]["poll_interval_seconds"] == 60  # clamped to min


# --- Sync ---


def test_remarkable_sync_requires_dropbox(authed_client):
    response = authed_client.post("/api/remarkable/sync")
    assert response.status_code == 400
    assert "not connected" in response.json()["error"]


def test_remarkable_sync_copies_new_files(authed_client):
    _write_tokens(_base_tokens(remarkable_sync={
        "enabled": True,
        "source_folder": "/Email Attachments",
        "dest_folder": "/Dest",
    }))

    list_response = httpx.Response(200, json={
        "entries": [
            {".tag": "file", "name": "note.pdf", "path_display": "/Email Attachments/note.pdf", "size": 1024},
        ],
        "cursor": "cursor-123",
        "has_more": False,
    })
    create_folder_response = httpx.Response(200, json={})
    # get_metadata 404 means file doesn't exist at dest
    metadata_response = httpx.Response(409, json={"error": "not_found"})
    copy_response = httpx.Response(200, json={
        "metadata": {"name": "note.pdf", "path_display": "/Dest/note.pdf"},
    })

    call_count = {"n": 0}
    responses = [create_folder_response, list_response, metadata_response, copy_response]

    async def mock_request(method, url, tokens, **kwargs):
        idx = min(call_count["n"], len(responses) - 1)
        resp = responses[call_count["n"]] if call_count["n"] < len(responses) else responses[-1]
        call_count["n"] += 1
        return resp

    with patch("server.remarkable_sync._dropbox_request", side_effect=mock_request):
        response = authed_client.post("/api/remarkable/sync")

    assert response.status_code == 200
    data = response.json()
    assert data["files_copied"] == 1
    assert data["details"][0]["file_name"] == "note.pdf"
    assert data["details"][0]["status"] == "copied"


def test_remarkable_sync_skips_existing(authed_client):
    _write_tokens(_base_tokens(remarkable_sync={
        "enabled": True,
        "source_folder": "/Email Attachments",
        "dest_folder": "/Dest",
    }))

    list_response = httpx.Response(200, json={
        "entries": [
            {".tag": "file", "name": "old.pdf", "path_display": "/Email Attachments/old.pdf", "size": 512},
        ],
        "cursor": "cursor-456",
        "has_more": False,
    })
    create_folder_response = httpx.Response(200, json={})
    # get_metadata 200 means file already exists at dest
    metadata_response = httpx.Response(200, json={"name": "old.pdf"})

    call_count = {"n": 0}
    responses = [create_folder_response, list_response, metadata_response]

    async def mock_request(method, url, tokens, **kwargs):
        resp = responses[min(call_count["n"], len(responses) - 1)]
        call_count["n"] += 1
        return resp

    with patch("server.remarkable_sync._dropbox_request", side_effect=mock_request):
        response = authed_client.post("/api/remarkable/sync")

    assert response.status_code == 200
    data = response.json()
    assert data["files_skipped"] == 1
    assert data["details"][0]["status"] == "skipped"


def test_remarkable_sync_handles_missing_source_folder(authed_client):
    _write_tokens(_base_tokens(remarkable_sync={
        "enabled": True,
        "source_folder": "/Nonexistent",
        "dest_folder": "/Dest",
    }))

    create_folder_response = httpx.Response(200, json={})
    not_found_response = httpx.Response(409, text='{"error": "not_found"}')

    call_count = {"n": 0}
    responses = [create_folder_response, not_found_response]

    async def mock_request(method, url, tokens, **kwargs):
        resp = responses[min(call_count["n"], len(responses) - 1)]
        call_count["n"] += 1
        return resp

    with patch("server.remarkable_sync._dropbox_request", side_effect=mock_request):
        response = authed_client.post("/api/remarkable/sync")

    assert response.status_code == 200
    data = response.json()
    assert data["files_copied"] == 0
    assert data["errors"] == []


# --- Log ---


def test_remarkable_log_empty(authed_client):
    _write_tokens(_base_tokens())
    response = authed_client.get("/api/remarkable/log")
    assert response.status_code == 200
    assert response.json()["entries"] == []


def test_remarkable_log_returns_entries(authed_client):
    log_entries = [
        {"timestamp": "2026-01-01T00:00:00Z", "file_name": f"file{i}.pdf", "status": "copied", "size_bytes": 100}
        for i in range(5)
    ]
    _write_tokens(_base_tokens(remarkable_sync={"sync_log": log_entries}))
    response = authed_client.get("/api/remarkable/log")
    assert response.status_code == 200
    assert len(response.json()["entries"]) == 5
