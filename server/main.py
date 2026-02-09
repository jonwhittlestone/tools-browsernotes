import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from server.auth import is_authenticated, create_session_cookie, clear_session_cookie
from server.config import AUTH_PASSWORD, PORT, DATA_DIR, ROOT_PATH
from server.dropbox_proxy import router as dropbox_router
from server.remarkable_sync import router as remarkable_router, remarkable_sync_loop


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(remarkable_sync_loop())
    yield
    task.cancel()


app = FastAPI(root_path=ROOT_PATH, lifespan=lifespan)
app.include_router(dropbox_router)
app.include_router(remarkable_router)

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = PROJECT_ROOT / "web"
DIST_DIR = PROJECT_ROOT / "dist"


def _prefixed(path: str) -> str:
    return f"{ROOT_PATH}{path}"


def _require_auth(request: Request) -> RedirectResponse | None:
    if not is_authenticated(request):
        return RedirectResponse(url=_prefixed("/login"), status_code=302)
    return None


# --- Health (no auth) ---


@app.get("/health")
async def health():
    return {"status": "healthy"}


# --- Login ---


@app.get("/login", response_class=HTMLResponse)
async def login_page(request: Request):
    if is_authenticated(request):
        return RedirectResponse(url=_prefixed("/"), status_code=302)
    login_html = WEB_DIR / "login.html"
    return HTMLResponse(content=_render_html(login_html.read_text()))


@app.post("/login")
async def login(password: str = Form(...)):
    if password == AUTH_PASSWORD:
        response = RedirectResponse(url=_prefixed("/"), status_code=302)
        create_session_cookie(response)
        return response
    login_html = WEB_DIR / "login.html"
    content = login_html.read_text().replace(
        "<!-- ERROR_PLACEHOLDER -->",
        '<p class="error">Incorrect password</p>',
    )
    return HTMLResponse(content=_render_html(content), status_code=401)


@app.post("/logout")
async def logout():
    response = RedirectResponse(url=_prefixed("/login"), status_code=302)
    clear_session_cookie(response)
    return response


# --- Static files (auth required via middleware) ---


@app.get("/static/{path:path}")
async def serve_static(request: Request, path: str):
    redirect = _require_auth(request)
    if redirect:
        return redirect
    # Try dist/ first (bundled JS), then web/ (CSS, etc.)
    for base_dir in [DIST_DIR, WEB_DIR]:
        file_path = base_dir / path
        if file_path.is_file():
            content_type = _guess_content_type(path)
            return FileResponse(file_path, media_type=content_type)
    return JSONResponse({"error": "not found"}, status_code=404)


# --- PWA ---


@app.get("/manifest.webmanifest")
async def manifest(request: Request):
    redirect = _require_auth(request)
    if redirect:
        return redirect
    manifest_file = WEB_DIR / "manifest.webmanifest"
    content = _render_html(manifest_file.read_text())
    return HTMLResponse(content=content, media_type="application/manifest+json")


@app.get("/sw.js")
async def service_worker(request: Request):
    sw_file = WEB_DIR / "sw.js"
    return FileResponse(sw_file, media_type="application/javascript")


# --- Main page ---


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    redirect = _require_auth(request)
    if redirect:
        return redirect
    index_html = WEB_DIR / "index.html"
    if not index_html.exists():
        return HTMLResponse("<h1>Browser Notes</h1><p>Web frontend not built yet.</p>")
    return HTMLResponse(content=_render_html(index_html.read_text()))


def _render_html(content: str) -> str:
    return content.replace("{{ROOT_PATH}}", ROOT_PATH)


def _guess_content_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return {
        ".js": "application/javascript",
        ".css": "text/css",
        ".html": "text/html",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".ico": "image/x-icon",
        ".map": "application/json",
        ".webmanifest": "application/manifest+json",
    }.get(ext, "application/octet-stream")


# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)
