"""Tests for the OCR pipeline (server/ocr.py) and sync integration.

All ML dependencies (torch, transformers, fitz) are mocked so tests run
fast without downloading models.
"""

import json
import os
import sys
from unittest.mock import MagicMock, patch

import httpx
import numpy as np
import pytest
from PIL import Image

from server.config import DATA_DIR

TOKENS_FILE = os.path.join(DATA_DIR, "dropbox_tokens.json")


def _write_tokens(tokens: dict):
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(TOKENS_FILE, "w") as f:
        json.dump(tokens, f)


def _base_tokens(**extra):
    tokens = {"access_token": "test-token", "refresh_token": "test-refresh"}
    tokens.update(extra)
    return tokens


@pytest.fixture(autouse=True)
def clean_tokens():
    """Ensure clean state for each test."""
    if os.path.exists(TOKENS_FILE):
        os.remove(TOKENS_FILE)
    yield
    if os.path.exists(TOKENS_FILE):
        os.remove(TOKENS_FILE)


# ---------------------------------------------------------------------------
# pdf_to_images
# ---------------------------------------------------------------------------


def test_pdf_to_images_returns_one_image_per_page():
    mock_pix = MagicMock()
    mock_pix.width = 100
    mock_pix.height = 50
    mock_pix.samples = bytes([128] * (100 * 50 * 3))  # RGB

    mock_page = MagicMock()
    mock_page.get_pixmap.return_value = mock_pix

    mock_doc = MagicMock()
    mock_doc.__iter__ = lambda self: iter([mock_page])

    mock_fitz = MagicMock()
    mock_fitz.open.return_value = mock_doc

    with patch.dict(sys.modules, {"fitz": mock_fitz}):
        from server.ocr import pdf_to_images

        images = pdf_to_images(b"fake-pdf-bytes")

    assert len(images) == 1
    assert images[0].size == (100, 50)
    mock_doc.close.assert_called_once()


def test_pdf_to_images_multiple_pages():
    mock_pix = MagicMock()
    mock_pix.width = 80
    mock_pix.height = 40
    mock_pix.samples = bytes([200] * (80 * 40 * 3))

    page1 = MagicMock()
    page1.get_pixmap.return_value = mock_pix
    page2 = MagicMock()
    page2.get_pixmap.return_value = mock_pix

    mock_doc = MagicMock()
    mock_doc.__iter__ = lambda self: iter([page1, page2])

    mock_fitz = MagicMock()
    mock_fitz.open.return_value = mock_doc

    with patch.dict(sys.modules, {"fitz": mock_fitz}):
        from server.ocr import pdf_to_images

        images = pdf_to_images(b"fake-pdf-bytes")

    assert len(images) == 2


# ---------------------------------------------------------------------------
# segment_lines
# ---------------------------------------------------------------------------


def test_segment_lines_detects_text_rows():
    from server.ocr import segment_lines

    # 200px tall, 100px wide white image with two dark horizontal bands
    img_array = np.ones((200, 100), dtype=np.uint8) * 255
    img_array[20:50, :] = 50  # line 1 (dark)
    img_array[80:110, :] = 50  # line 2 (dark)
    img = Image.fromarray(img_array, mode="L").convert("RGB")

    lines = segment_lines(img)
    assert len(lines) == 2


def test_segment_lines_empty_page():
    from server.ocr import segment_lines

    white = Image.new("RGB", (100, 200), (255, 255, 255))
    lines = segment_lines(white)
    assert len(lines) == 0


def test_segment_lines_filters_tiny_noise():
    from server.ocr import segment_lines

    # A 5px high dark strip should be filtered out (below min_line_height=15)
    img_array = np.ones((200, 100), dtype=np.uint8) * 255
    img_array[50:55, :] = 50  # tiny noise
    img = Image.fromarray(img_array, mode="L").convert("RGB")

    lines = segment_lines(img)
    assert len(lines) == 0


def test_segment_lines_line_at_bottom():
    from server.ocr import segment_lines

    # Dark band touching the bottom of the image
    img_array = np.ones((200, 100), dtype=np.uint8) * 255
    img_array[170:200, :] = 50
    img = Image.fromarray(img_array, mode="L").convert("RGB")

    lines = segment_lines(img)
    assert len(lines) == 1


def test_segment_lines_inserts_gap_marker():
    """A large gap between text regions produces a None paragraph break."""
    from server.ocr import segment_lines

    # Two 30px dark bands separated by a 60px gap (> avg line height of 30)
    img_array = np.ones((200, 100), dtype=np.uint8) * 255
    img_array[10:40, :] = 50   # line 1
    img_array[100:130, :] = 50  # line 2 (gap = 60px, avg height = 30px)
    img = Image.fromarray(img_array, mode="L").convert("RGB")

    lines = segment_lines(img)
    assert len(lines) == 3  # line, None, line
    assert lines[0] is not None
    assert lines[1] is None
    assert lines[2] is not None


def test_segment_lines_no_gap_marker_for_small_gaps():
    """Closely spaced lines do not produce paragraph breaks."""
    from server.ocr import segment_lines

    # Two 30px dark bands separated by a 20px gap (< avg height of 30)
    img_array = np.ones((200, 100), dtype=np.uint8) * 255
    img_array[10:40, :] = 50   # line 1
    img_array[60:90, :] = 50   # line 2 (gap = 20px, avg height = 30px)
    img = Image.fromarray(img_array, mode="L").convert("RGB")

    lines = segment_lines(img)
    assert len(lines) == 2  # no None markers
    assert all(l is not None for l in lines)


# ---------------------------------------------------------------------------
# recognise_lines
# ---------------------------------------------------------------------------


def test_recognise_lines_returns_text():
    import torch

    mock_processor = MagicMock()
    mock_processor.return_value.pixel_values = torch.zeros(1, 3, 384, 384)
    mock_processor.batch_decode.return_value = ["Hello world"]

    mock_model = MagicMock()
    mock_model.generate.return_value = torch.tensor([[1, 2, 3]])

    with patch("server.ocr._load_model", return_value=(mock_processor, mock_model)):
        from server.ocr import recognise_lines

        imgs = [Image.new("RGB", (200, 30), (255, 255, 255))]
        result = recognise_lines(imgs)

    assert result == ["Hello world"]


def test_recognise_lines_empty_input():
    from server.ocr import recognise_lines

    result = recognise_lines([])
    assert result == []


def test_recognise_lines_multiple_lines():
    import torch

    call_count = {"n": 0}
    texts = ["Line one", "Line two", "Line three"]

    mock_processor = MagicMock()
    mock_processor.return_value.pixel_values = torch.zeros(1, 3, 384, 384)

    def batch_decode_side_effect(ids, **kwargs):
        idx = min(call_count["n"], len(texts) - 1)
        call_count["n"] += 1
        return [texts[idx]]

    mock_processor.batch_decode.side_effect = batch_decode_side_effect

    mock_model = MagicMock()
    mock_model.generate.return_value = torch.tensor([[1]])

    with patch("server.ocr._load_model", return_value=(mock_processor, mock_model)):
        from server.ocr import recognise_lines

        imgs = [Image.new("RGB", (200, 30)) for _ in range(3)]
        result = recognise_lines(imgs)

    assert len(result) == 3
    assert result[0] == "Line one"


# ---------------------------------------------------------------------------
# ocr_pdf (end-to-end, mocked)
# ---------------------------------------------------------------------------


def test_ocr_pdf_end_to_end():
    fake_image = Image.new("RGB", (100, 200), (255, 255, 255))
    fake_line = Image.new("RGB", (100, 20), (0, 0, 0))

    with (
        patch("server.ocr.pdf_to_images", return_value=[fake_image]),
        patch("server.ocr.segment_lines", return_value=[fake_line, fake_line]),
        patch("server.ocr.recognise_lines", side_effect=lambda imgs: ["line one"] if imgs[0] == fake_line else ["?"]),
        patch("server.ocr._unload_model"),
    ):
        from server.ocr import ocr_pdf

        text = ocr_pdf(b"fake-pdf")

    assert "line one" in text


def test_ocr_pdf_handles_error_gracefully():
    with (
        patch("server.ocr.pdf_to_images", side_effect=Exception("corrupt PDF")),
        patch("server.ocr._unload_model"),
    ):
        from server.ocr import ocr_pdf

        text = ocr_pdf(b"corrupt-data")

    assert text == ""


def test_ocr_pdf_calls_progress_callback():
    fake_image = Image.new("RGB", (100, 200))
    fake_line1 = Image.new("RGB", (100, 20))
    fake_line2 = Image.new("RGB", (100, 20))

    progress_calls = []

    def track_progress(done, total):
        progress_calls.append((done, total))

    with (
        patch("server.ocr.pdf_to_images", return_value=[fake_image]),
        patch("server.ocr.segment_lines", return_value=[fake_line1, fake_line2]),
        patch("server.ocr.recognise_lines", return_value=["text"]),
        patch("server.ocr._unload_model"),
    ):
        from server.ocr import ocr_pdf

        ocr_pdf(b"fake-pdf", progress_callback=track_progress)

    # Should be called once per line (2 lines)
    assert len(progress_calls) == 2
    assert progress_calls[0] == (1, 2)
    assert progress_calls[1] == (2, 2)


def test_ocr_pdf_always_unloads_model():
    """_unload_model is called even when OCR succeeds."""
    with (
        patch("server.ocr.pdf_to_images", return_value=[]),
        patch("server.ocr._unload_model") as mock_unload,
    ):
        from server.ocr import ocr_pdf

        ocr_pdf(b"empty-pdf")

    mock_unload.assert_called_once()


def test_ocr_pdf_unloads_model_on_error():
    """_unload_model is called even when OCR fails."""
    with (
        patch("server.ocr.pdf_to_images", side_effect=RuntimeError("boom")),
        patch("server.ocr._unload_model") as mock_unload,
    ):
        from server.ocr import ocr_pdf

        ocr_pdf(b"bad-data")

    mock_unload.assert_called_once()


# ---------------------------------------------------------------------------
# /api/remarkable/ocr endpoint
# ---------------------------------------------------------------------------


def test_ocr_endpoint_requires_auth(client):
    response = client.post("/api/remarkable/ocr", json={"path": "/test.pdf"})
    assert response.status_code == 401


def test_ocr_endpoint_rejects_non_pdf(authed_client):
    _write_tokens(_base_tokens())
    response = authed_client.post("/api/remarkable/ocr", json={"path": "/test.txt"})
    assert response.status_code == 400
    assert "pdf" in response.json()["error"].lower()


def test_ocr_endpoint_rejects_empty_path(authed_client):
    _write_tokens(_base_tokens())
    response = authed_client.post("/api/remarkable/ocr", json={"path": ""})
    assert response.status_code == 400


def test_ocr_endpoint_requires_dropbox(authed_client):
    _write_tokens({"remarkable_sync": {}})
    response = authed_client.post("/api/remarkable/ocr", json={"path": "/note.pdf"})
    assert response.status_code == 400
    assert "not connected" in response.json()["error"]


def test_ocr_endpoint_success(authed_client):
    _write_tokens(_base_tokens())

    call_log = []

    async def mock_request(method, url, tokens, **kwargs):
        call_log.append(url)
        if "download" in url:
            return httpx.Response(200, content=b"fake-pdf-bytes")
        if "upload" in url:
            return httpx.Response(200, json={})
        return httpx.Response(200, json={})

    with (
        patch("server.remarkable_sync._dropbox_request", side_effect=mock_request),
        patch("server.remarkable_sync.ocr_pdf", return_value="Hello world\nLine two"),
    ):
        response = authed_client.post(
            "/api/remarkable/ocr",
            json={"path": "/folder/note.pdf"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "completed"
    assert data["text_path"] == "/folder/note.txt"
    assert data["lines"] == 2
    assert "Hello world" in data["text"]
    # Verify upload was called
    assert any("upload" in url for url in call_log)


def test_ocr_endpoint_empty_result(authed_client):
    _write_tokens(_base_tokens())

    async def mock_request(method, url, tokens, **kwargs):
        if "download" in url:
            return httpx.Response(200, content=b"fake-pdf-bytes")
        return httpx.Response(200, json={})

    with (
        patch("server.remarkable_sync._dropbox_request", side_effect=mock_request),
        patch("server.remarkable_sync.ocr_pdf", return_value=""),
    ):
        response = authed_client.post(
            "/api/remarkable/ocr",
            json={"path": "/folder/note.pdf"},
        )

    assert response.status_code == 200
    data = response.json()
    assert data["text_path"] is None
    assert data["lines"] == 0


def test_ocr_endpoint_download_failure(authed_client):
    _write_tokens(_base_tokens())

    async def mock_request(method, url, tokens, **kwargs):
        return httpx.Response(404, text="not found")

    with patch("server.remarkable_sync._dropbox_request", side_effect=mock_request):
        response = authed_client.post(
            "/api/remarkable/ocr",
            json={"path": "/missing/note.pdf"},
        )

    assert response.status_code == 400
    assert "download" in response.json()["error"].lower()


# ---------------------------------------------------------------------------
# ocr_enabled config toggle
# ---------------------------------------------------------------------------


def test_status_includes_ocr_enabled(authed_client):
    _write_tokens(_base_tokens(remarkable_sync={"ocr_enabled": False}))
    response = authed_client.get("/api/remarkable/status")
    assert response.status_code == 200
    assert response.json()["ocr_enabled"] is False


def test_status_ocr_enabled_defaults_true(authed_client):
    _write_tokens(_base_tokens(remarkable_sync={}))
    response = authed_client.get("/api/remarkable/status")
    assert response.status_code == 200
    assert response.json()["ocr_enabled"] is True


def test_config_saves_ocr_enabled(authed_client):
    _write_tokens(_base_tokens(remarkable_sync={}))
    authed_client.post(
        "/api/remarkable/config",
        json={"ocr_enabled": False},
    )
    response = authed_client.get("/api/remarkable/status")
    assert response.json()["ocr_enabled"] is False


# ---------------------------------------------------------------------------
# _append_progress_log
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_append_progress_log_creates_new_file():
    """Creates a fresh log when no existing file is found on Dropbox."""
    uploaded = {}

    async def mock_request(method, url, tokens, **kwargs):
        if "download" in url:
            return httpx.Response(409, text="not found")
        if "upload" in url:
            uploaded["body"] = kwargs.get("content", b"").decode()
            return httpx.Response(200, json={})
        return httpx.Response(200, json={})

    with patch("server.remarkable_sync._dropbox_request", side_effect=mock_request):
        from server.remarkable_sync import _append_progress_log

        await _append_progress_log({"access_token": "t"}, "/dest", "test message")

    assert "test message" in uploaded["body"]
    assert uploaded["body"].count("\n") >= 1


@pytest.mark.asyncio
async def test_append_progress_log_appends_to_existing():
    """Appends to an existing log file downloaded from Dropbox."""
    existing_log = "[2026-01-01 00:00:00] old entry\n"
    uploaded = {}

    async def mock_request(method, url, tokens, **kwargs):
        if "download" in url:
            return httpx.Response(200, content=existing_log.encode())
        if "upload" in url:
            uploaded["body"] = kwargs.get("content", b"").decode()
            return httpx.Response(200, json={})
        return httpx.Response(200, json={})

    with patch("server.remarkable_sync._dropbox_request", side_effect=mock_request):
        from server.remarkable_sync import _append_progress_log

        await _append_progress_log({"access_token": "t"}, "/dest", "new entry")

    assert "old entry" in uploaded["body"]
    assert "new entry" in uploaded["body"]


@pytest.mark.asyncio
async def test_append_progress_log_caps_at_max_lines():
    """Trims oldest lines when the log exceeds MAX_PROGRESS_LOG_LINES."""
    from server.remarkable_sync import MAX_PROGRESS_LOG_LINES

    existing_lines = [f"[2026-01-01 00:00:00] line {i}" for i in range(MAX_PROGRESS_LOG_LINES)]
    existing_log = "\n".join(existing_lines) + "\n"
    uploaded = {}

    async def mock_request(method, url, tokens, **kwargs):
        if "download" in url:
            return httpx.Response(200, content=existing_log.encode())
        if "upload" in url:
            uploaded["body"] = kwargs.get("content", b"").decode()
            return httpx.Response(200, json={})
        return httpx.Response(200, json={})

    with patch("server.remarkable_sync._dropbox_request", side_effect=mock_request):
        from server.remarkable_sync import _append_progress_log

        await _append_progress_log({"access_token": "t"}, "/dest", "overflow entry")

    result_lines = uploaded["body"].strip().split("\n")
    assert len(result_lines) == MAX_PROGRESS_LOG_LINES
    # Oldest line should be trimmed, newest should be present
    assert "line 0" not in uploaded["body"]
    assert "overflow entry" in uploaded["body"]


@pytest.mark.asyncio
async def test_append_progress_log_survives_upload_failure():
    """Does not raise when the upload to Dropbox fails."""

    async def mock_request(method, url, tokens, **kwargs):
        if "download" in url:
            return httpx.Response(409, text="not found")
        if "upload" in url:
            raise ConnectionError("network down")
        return httpx.Response(200, json={})

    with patch("server.remarkable_sync._dropbox_request", side_effect=mock_request):
        from server.remarkable_sync import _append_progress_log

        # Should not raise
        await _append_progress_log({"access_token": "t"}, "/dest", "msg")


# ---------------------------------------------------------------------------
# _run_ocr_for_file progress logging
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_run_ocr_writes_progress_entries():
    """Background OCR writes started + completed entries to the progress log."""
    log_messages = []

    async def mock_append_log(tokens, dest_folder, message):
        log_messages.append(message)

    async def mock_download(tokens, path):
        return b"fake-pdf"

    async def mock_upload(tokens, path, content):
        pass

    with (
        patch("server.remarkable_sync._append_progress_log", side_effect=mock_append_log),
        patch("server.remarkable_sync._download_file", side_effect=mock_download),
        patch("server.remarkable_sync._upload_text", side_effect=mock_upload),
        patch("server.remarkable_sync.ocr_pdf", return_value="Hello\nWorld"),
        patch("server.remarkable_sync._load_tokens", return_value={}),
        patch("server.remarkable_sync._save_tokens"),
    ):
        from server.remarkable_sync import _run_ocr_for_file

        config = {"dest_folder": "/dest", "sync_log": []}
        await _run_ocr_for_file({"access_token": "t"}, "/dest/note.pdf", config, "2026-01-01")

    assert any("OCR started" in m for m in log_messages)
    assert any("completed" in m for m in log_messages)


@pytest.mark.asyncio
async def test_run_ocr_logs_error_on_failure():
    """Background OCR writes an error entry when the download fails."""
    log_messages = []

    async def mock_append_log(tokens, dest_folder, message):
        log_messages.append(message)

    async def mock_download(tokens, path):
        raise ConnectionError("download failed")

    with (
        patch("server.remarkable_sync._append_progress_log", side_effect=mock_append_log),
        patch("server.remarkable_sync._download_file", side_effect=mock_download),
    ):
        from server.remarkable_sync import _run_ocr_for_file

        config = {"dest_folder": "/dest"}
        await _run_ocr_for_file({"access_token": "t"}, "/dest/note.pdf", config, "2026-01-01")

    assert any("error" in m for m in log_messages)
