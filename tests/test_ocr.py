"""Tests for the OCR pipeline (server/ocr.py).

All ML dependencies (torch, transformers, fitz) are mocked so tests run
fast without downloading models.
"""

import sys
from unittest.mock import MagicMock, patch

import numpy as np
import pytest
from PIL import Image


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
