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


def test_dropbox_status_unauthenticated(client):
    response = client.get("/api/dropbox/status")
    assert response.status_code == 401


def test_dropbox_status_not_connected(authed_client):
    response = authed_client.get("/api/dropbox/status")
    assert response.status_code == 200
    data = response.json()
    assert data["connected"] is False
    assert data["file_path"] is None


def test_dropbox_status_connected(authed_client):
    _write_tokens({
        "access_token": "test-token",
        "refresh_token": "test-refresh",
        "file_path": "/notes/todo.md",
        "auto_sync": True,
        "sync_frequency": 30,
    })
    response = authed_client.get("/api/dropbox/status")
    assert response.status_code == 200
    data = response.json()
    assert data["connected"] is True
    assert data["file_path"] == "/notes/todo.md"


def test_dropbox_auth_redirects_to_dropbox(authed_client):
    response = authed_client.get("/api/dropbox/auth", follow_redirects=False)
    assert response.status_code == 307
    location = response.headers["location"]
    assert "dropbox.com/oauth2/authorize" in location
    assert "code_challenge" in location


def test_dropbox_disconnect(authed_client):
    _write_tokens({"access_token": "test-token"})
    response = authed_client.post("/api/dropbox/disconnect")
    assert response.status_code == 200
    assert response.json()["status"] == "disconnected"
    assert not os.path.exists(TOKENS_FILE)


def test_dropbox_save_config(authed_client):
    _write_tokens({"access_token": "test-token"})
    response = authed_client.post(
        "/api/dropbox/config",
        json={"filePath": "/new/path.md", "autoSync": False, "syncFrequency": 60},
    )
    assert response.status_code == 200
    with open(TOKENS_FILE) as f:
        tokens = json.load(f)
    assert tokens["file_path"] == "/new/path.md"
    assert tokens["auto_sync"] is False
    assert tokens["sync_frequency"] == 60


def test_dropbox_files_requires_connection(authed_client):
    response = authed_client.post("/api/dropbox/files", json={"path": "/"})
    assert response.status_code == 400
    assert "not connected" in response.json()["error"]


def test_dropbox_read_requires_connection(authed_client):
    response = authed_client.post("/api/dropbox/read", json={"path": "/test.md"})
    assert response.status_code == 400


def test_dropbox_write_requires_connection(authed_client):
    response = authed_client.post(
        "/api/dropbox/write",
        json={"path": "/test.md", "content": "hello"},
    )
    assert response.status_code == 400


def test_dropbox_metadata_requires_connection(authed_client):
    response = authed_client.post("/api/dropbox/metadata", json={"path": "/test.md"})
    assert response.status_code == 400


def test_dropbox_callback_no_code(authed_client):
    response = authed_client.get("/api/dropbox/callback")
    assert response.status_code == 400


def test_dropbox_all_routes_require_auth(client):
    """All dropbox routes should return 401 when not authenticated."""
    routes = [
        ("GET", "/api/dropbox/status"),
        ("GET", "/api/dropbox/auth"),
        ("GET", "/api/dropbox/callback?code=test"),
        ("POST", "/api/dropbox/files"),
        ("POST", "/api/dropbox/read"),
        ("POST", "/api/dropbox/write"),
        ("POST", "/api/dropbox/metadata"),
        ("POST", "/api/dropbox/disconnect"),
        ("POST", "/api/dropbox/config"),
    ]
    for method, path in routes:
        if method == "GET":
            response = client.get(path, follow_redirects=False)
        else:
            response = client.post(path, json={})
        assert response.status_code == 401, f"{method} {path} should require auth"
