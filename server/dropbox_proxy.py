import hashlib
import json
import os
import secrets
import base64

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, JSONResponse

from server.auth import is_authenticated
from server.config import DROPBOX_APP_KEY, DROPBOX_REDIRECT_URI, DATA_DIR

router = APIRouter(prefix="/api/dropbox")

TOKENS_FILE = os.path.join(DATA_DIR, "dropbox_tokens.json")

# In-memory PKCE state (single-user app, safe for single instance)
_pkce_state: dict = {}


def _require_auth(request: Request) -> JSONResponse | None:
    if not is_authenticated(request):
        return JSONResponse({"error": "unauthorized"}, status_code=401)
    return None


def _load_tokens() -> dict:
    if not os.path.exists(TOKENS_FILE):
        return {}
    with open(TOKENS_FILE) as f:
        return json.load(f)


def _save_tokens(tokens: dict) -> None:
    os.makedirs(os.path.dirname(TOKENS_FILE), exist_ok=True)
    with open(TOKENS_FILE, "w") as f:
        json.dump(tokens, f, indent=2)


def _generate_code_verifier() -> str:
    return base64.urlsafe_b64encode(secrets.token_bytes(64)).rstrip(b"=").decode()


def _generate_code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


async def _dropbox_request(
    method: str,
    url: str,
    tokens: dict,
    **kwargs,
) -> httpx.Response:
    """Make a Dropbox API request, refreshing the token on 401."""
    headers = kwargs.pop("headers", {})
    headers["Authorization"] = f"Bearer {tokens.get('access_token', '')}"

    async with httpx.AsyncClient() as client:
        response = await client.request(method, url, headers=headers, **kwargs)

        if response.status_code == 401 and tokens.get("refresh_token"):
            # Try refreshing the token
            refresh_resp = await client.post(
                "https://api.dropboxapi.com/oauth2/token",
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": tokens["refresh_token"],
                    "client_id": DROPBOX_APP_KEY,
                },
            )
            if refresh_resp.status_code == 200:
                new_data = refresh_resp.json()
                tokens["access_token"] = new_data["access_token"]
                _save_tokens(tokens)

                headers["Authorization"] = f"Bearer {tokens['access_token']}"
                response = await client.request(
                    method, url, headers=headers, **kwargs
                )

        return response


# --- Routes ---


@router.get("/auth")
async def initiate_auth(request: Request):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    verifier = _generate_code_verifier()
    challenge = _generate_code_challenge(verifier)
    _pkce_state["code_verifier"] = verifier

    auth_url = (
        f"https://www.dropbox.com/oauth2/authorize?"
        f"client_id={DROPBOX_APP_KEY}"
        f"&response_type=code"
        f"&code_challenge={challenge}"
        f"&code_challenge_method=S256"
        f"&token_access_type=offline"
        f"&redirect_uri={DROPBOX_REDIRECT_URI}"
    )
    return RedirectResponse(url=auth_url)


@router.get("/callback")
async def oauth_callback(request: Request, code: str = ""):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    if not code:
        return JSONResponse({"error": "no authorization code"}, status_code=400)

    verifier = _pkce_state.get("code_verifier")
    if not verifier:
        return JSONResponse({"error": "no PKCE verifier found"}, status_code=400)

    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.dropboxapi.com/oauth2/token",
            data={
                "code": code,
                "grant_type": "authorization_code",
                "client_id": DROPBOX_APP_KEY,
                "code_verifier": verifier,
                "redirect_uri": DROPBOX_REDIRECT_URI,
            },
        )

    if response.status_code != 200:
        return JSONResponse(
            {"error": "token exchange failed", "detail": response.text},
            status_code=400,
        )

    data = response.json()
    tokens = _load_tokens()
    tokens["access_token"] = data["access_token"]
    tokens["refresh_token"] = data.get("refresh_token", tokens.get("refresh_token"))
    _save_tokens(tokens)

    _pkce_state.clear()
    return RedirectResponse(url="/")


@router.get("/status")
async def dropbox_status(request: Request):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    tokens = _load_tokens()
    return {
        "connected": bool(tokens.get("access_token")),
        "file_path": tokens.get("file_path"),
        "auto_sync": tokens.get("auto_sync", True),
        "sync_frequency": tokens.get("sync_frequency", 30),
    }


@router.post("/files")
async def list_files(request: Request):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    body = await request.json()
    path = body.get("path", "")
    tokens = _load_tokens()

    if not tokens.get("access_token"):
        return JSONResponse({"error": "not connected to Dropbox"}, status_code=400)

    response = await _dropbox_request(
        "POST",
        "https://api.dropboxapi.com/2/files/list_folder",
        tokens,
        json={
            "path": "" if path == "/" else path,
            "recursive": False,
            "include_media_info": False,
            "include_deleted": False,
            "include_has_explicit_shared_members": False,
        },
    )

    if response.status_code != 200:
        return JSONResponse(
            {"error": "failed to list files", "detail": response.text},
            status_code=response.status_code,
        )

    data = response.json()
    entries = [
        {
            "id": entry["id"],
            "name": entry["name"],
            "path": entry["path_display"],
            "type": "folder" if entry[".tag"] == "folder" else "file",
            "rev": entry.get("rev"),
        }
        for entry in data.get("entries", [])
    ]
    return {"entries": entries}


@router.post("/read")
async def read_file(request: Request):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    body = await request.json()
    path = body.get("path", "")
    tokens = _load_tokens()

    if not tokens.get("access_token"):
        return JSONResponse({"error": "not connected to Dropbox"}, status_code=400)

    response = await _dropbox_request(
        "POST",
        "https://content.dropboxapi.com/2/files/download",
        tokens,
        headers={"Dropbox-API-Arg": json.dumps({"path": path})},
    )

    if response.status_code != 200:
        return JSONResponse(
            {"error": "failed to read file", "detail": response.text},
            status_code=response.status_code,
        )

    # Extract revision from response headers
    api_result = response.headers.get("dropbox-api-result", "{}")
    metadata = json.loads(api_result)

    return {"content": response.text, "rev": metadata.get("rev")}


@router.post("/write")
async def write_file(request: Request):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    body = await request.json()
    path = body.get("path", "")
    content = body.get("content", "")
    rev = body.get("rev")
    tokens = _load_tokens()

    if not tokens.get("access_token"):
        return JSONResponse({"error": "not connected to Dropbox"}, status_code=400)

    api_arg = {
        "path": path,
        "mode": {".tag": "update", "update": rev} if rev else "overwrite",
        "autorename": False,
        "mute": True,
    }

    response = await _dropbox_request(
        "POST",
        "https://content.dropboxapi.com/2/files/upload",
        tokens,
        headers={
            "Dropbox-API-Arg": json.dumps(api_arg),
            "Content-Type": "application/octet-stream",
        },
        content=content.encode(),
    )

    if response.status_code != 200:
        error_text = response.text
        if "conflict" in error_text.lower():
            return JSONResponse({"error": "FILE_CONFLICT"}, status_code=409)
        return JSONResponse(
            {"error": "failed to write file", "detail": error_text},
            status_code=response.status_code,
        )

    data = response.json()
    return {
        "id": data.get("id"),
        "name": data.get("name"),
        "path": data.get("path_display"),
        "rev": data.get("rev"),
    }


@router.post("/metadata")
async def file_metadata(request: Request):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    body = await request.json()
    path = body.get("path", "")
    tokens = _load_tokens()

    if not tokens.get("access_token"):
        return JSONResponse({"error": "not connected to Dropbox"}, status_code=400)

    response = await _dropbox_request(
        "POST",
        "https://api.dropboxapi.com/2/files/get_metadata",
        tokens,
        json={
            "path": path,
            "include_media_info": False,
            "include_deleted": False,
            "include_has_explicit_shared_members": False,
        },
    )

    if response.status_code == 409:
        return JSONResponse(None)

    if response.status_code != 200:
        return JSONResponse(
            {"error": "failed to get metadata", "detail": response.text},
            status_code=response.status_code,
        )

    data = response.json()
    return {
        "id": data.get("id"),
        "name": data.get("name"),
        "path": data.get("path_display"),
        "rev": data.get("rev"),
    }


@router.post("/disconnect")
async def disconnect(request: Request):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    if os.path.exists(TOKENS_FILE):
        os.remove(TOKENS_FILE)
    return {"status": "disconnected"}


@router.post("/config")
async def save_config(request: Request):
    auth_check = _require_auth(request)
    if auth_check:
        return auth_check

    body = await request.json()
    tokens = _load_tokens()
    tokens["file_path"] = body.get("filePath", tokens.get("file_path"))
    tokens["auto_sync"] = body.get("autoSync", tokens.get("auto_sync", True))
    tokens["sync_frequency"] = body.get(
        "syncFrequency", tokens.get("sync_frequency", 30)
    )
    _save_tokens(tokens)
    return {"status": "saved"}
