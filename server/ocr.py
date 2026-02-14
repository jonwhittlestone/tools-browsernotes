"""OCR pipeline for handwritten reMarkable notes.

Converts PDF pages to images, segments text lines via horizontal projection,
and recognises each line using TrOCR-small-handwritten (Hugging Face).

Heavy imports (torch, transformers, fitz) are deferred to function bodies
so the application starts fast and only pays the cost when OCR is triggered.
"""

import gc
import logging
import time
from typing import Callable

import numpy as np
from PIL import Image

logger = logging.getLogger("ocr")

# Lazy-loaded globals for the ML model
_processor = None
_model = None


def _load_model():
    """Load TrOCR model on first use. Cached in module globals."""
    global _processor, _model
    if _processor is not None:
        return _processor, _model

    import torch
    from transformers import TrOCRProcessor, VisionEncoderDecoderModel

    model_name = "microsoft/trocr-small-handwritten"
    logger.info("Loading OCR model: %s", model_name)
    start = time.monotonic()

    _processor = TrOCRProcessor.from_pretrained(model_name)
    _model = VisionEncoderDecoderModel.from_pretrained(
        model_name,
        torch_dtype=torch.float16,
    )
    _model.eval()

    elapsed = time.monotonic() - start
    logger.info("OCR model loaded in %.1fs", elapsed)
    return _processor, _model


def _unload_model():
    """Release model memory after OCR completes."""
    global _processor, _model
    _processor = None
    _model = None
    gc.collect()
    logger.info("OCR model unloaded")


def pdf_to_images(pdf_bytes: bytes) -> list[Image.Image]:
    """Convert a PDF to a list of PIL Images (one per page)."""
    import fitz  # PyMuPDF

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images = []
    for page in doc:
        pix = page.get_pixmap(dpi=200)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        images.append(img)
    doc.close()
    return images


def segment_lines(
    image: Image.Image, min_line_height: int = 15
) -> list[Image.Image]:
    """Split a page image into individual text lines using horizontal projection.

    Works well for reMarkable's lined paper with consistent horizontal text.
    """
    gray = np.array(image.convert("L"))
    # Dark pixels = ink (low value = dark on white paper)
    binary = (gray < 180).astype(np.uint8)
    projection = binary.sum(axis=1)

    # Regions with more than 2% of max projection are "text"
    threshold = projection.max() * 0.02 if projection.max() > 0 else 0
    in_line = projection > threshold

    lines = []
    start = None
    for i, val in enumerate(in_line):
        if val and start is None:
            start = i
        elif not val and start is not None:
            if i - start > min_line_height:
                lines.append(image.crop((0, start, image.width, i)))
            start = None
    # Handle line extending to bottom of page
    if start is not None and len(in_line) - start > min_line_height:
        lines.append(image.crop((0, start, image.width, len(in_line))))

    return lines


def recognise_lines(line_images: list[Image.Image]) -> list[str]:
    """Run TrOCR on a list of single-line images. Returns one string per line."""
    import torch

    if not line_images:
        return []

    processor, model = _load_model()
    results = []
    for img in line_images:
        pixel_values = processor(images=img, return_tensors="pt").pixel_values
        pixel_values = pixel_values.half()  # match model's float16
        with torch.no_grad():
            generated_ids = model.generate(pixel_values)
        text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        results.append(text.strip())

    return results


def ocr_pdf(
    pdf_bytes: bytes,
    progress_callback: Callable[[int, int], None] | None = None,
) -> str:
    """Full OCR pipeline: PDF bytes -> plain text string.

    Args:
        pdf_bytes: Raw PDF file content.
        progress_callback: Optional callback(lines_done, total_lines) called
            after each line is recognised.

    Returns empty string if no text is detected or an error occurs.
    """
    try:
        start = time.monotonic()
        images = pdf_to_images(pdf_bytes)

        # First pass: segment all pages to get total line count
        all_page_lines: list[list[Image.Image]] = []
        total_lines = 0
        for page_img in images:
            page_lines = segment_lines(page_img)
            all_page_lines.append(page_lines)
            total_lines += len(page_lines)

        logger.info(
            "%d page(s), %d lines detected", len(images), total_lines
        )

        # Second pass: recognise lines with progress tracking
        all_texts: list[str] = []
        lines_done = 0
        for page_num, page_lines in enumerate(all_page_lines):
            if page_lines:
                for line_img in page_lines:
                    texts = recognise_lines([line_img])
                    all_texts.extend(texts)
                    lines_done += 1
                    if progress_callback and total_lines > 0:
                        progress_callback(lines_done, total_lines)
            if page_num < len(all_page_lines) - 1:
                all_texts.append("")  # blank line between pages

        elapsed = time.monotonic() - start
        text = "\n".join(all_texts)
        logger.info(
            "OCR complete: %d pages, %d lines, %.1fs",
            len(images),
            total_lines,
            elapsed,
        )
        return text
    except Exception:
        logger.exception("OCR failed")
        return ""
    finally:
        _unload_model()
