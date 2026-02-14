# OCR for reMarkable Handwritten Notes

## Overview

Automatically extract text from handwritten reMarkable notes (PDFs) that have been synced to Dropbox, and save the OCR output as a `.txt` file alongside the original PDF. This extends the existing reMarkable email sync pipeline with an OCR post-processing step.

## Problem

Handwritten notes synced from the reMarkable tablet are saved as PDF images (e.g. `random.pdf`). These are not searchable and can't be referenced as text. The goal is to produce a plain-text transcription of each note so the content is accessible, searchable, and usable in other tools (Obsidian, grep, etc.).

## Example Input/Output

```
Input:  _remarkable-emails-via-browsernotes/random/2026-02-13-W07-Fri/random.pdf
Output: _remarkable-emails-via-browsernotes/random/2026-02-13-W07-Fri/random.txt
```

The input PDFs contain multi-line handwritten text on lined paper (reMarkable's default template), typically one page per note.

## Architecture

### Where OCR Runs

The OCR runs on **doylestonex** (Raspberry Pi 4, ARM64), the same machine that hosts the browsernotes server. It runs as a post-processing step integrated into the existing reMarkable sync pipeline.

**Host constraints (doylestonex, as of 2026-02-14):**
- Raspberry Pi 4, 4GB RAM (3.7 GiB usable)
- ARM64 (aarch64), 4 CPU cores
- No GPU — CPU-only inference
- ~3.0 GiB RAM available (with 6 containers running: traefik, hello-world, fam-calplan, kaizen, browsernotes, bookit)
- ~700 MiB used, 512 MiB swap (47 MiB used)
- Runs inside a Podman container (currently `python:3.12-slim` base)
- Disk: 235 GB SSD, 178 GB free — ample space for models

### Pipeline

```
reMarkable tablet
    → email to Dropbox
    → remarkable_sync.py copies PDF to dest folder on Dropbox
    → [NEW] OCR step: download PDF → extract page images → detect lines → recognise text → upload .txt
```

The OCR step triggers after a successful file copy in `run_sync()`. It:

1. Downloads the PDF from Dropbox (via existing `_dropbox_request`)
2. Converts PDF pages to images (pdf2image / PyMuPDF)
3. Detects individual text lines on each page (line segmentation)
4. Runs handwriting recognition on each line
5. Joins recognised lines into a single text output
6. Uploads the `.txt` file back to Dropbox alongside the PDF

## Model Selection Analysis

TrOCR (Transformer-based OCR) from Microsoft, available on Hugging Face, is the primary candidate. It was designed specifically for OCR and has handwriting-specific fine-tuned variants.

### TrOCR Variants

| Model | Params | Size (float32) | Quality | Pi 4 Feasibility |
|-------|--------|----------------|---------|-------------------|
| [trocr-small-handwritten](https://huggingface.co/microsoft/trocr-small-handwritten) | ~62M | ~234 MB | Good | Best candidate |
| [trocr-base-handwritten](https://huggingface.co/microsoft/trocr-base-handwritten) | ~334M | ~1.3 GB | Better | Marginal on 4GB Pi |
| [trocr-large-handwritten](https://huggingface.co/microsoft/trocr-large-handwritten) | ~558M | ~2.2 GB | Best | Not feasible on Pi 4 |

**Recommendation: `trocr-small-handwritten`** — fits comfortably in memory on the Pi 4 and provides good quality for personal handwriting notes.

### Critical Limitation: Single-Line Only

TrOCR processes **single text-line images only**. A full-page handwritten note must be segmented into individual lines before recognition. This requires a two-stage pipeline:

1. **Line detection/segmentation** — identify and crop individual text lines from the page
2. **Line recognition** — run TrOCR on each cropped line

### Line Segmentation Options

| Approach | Description | Pros | Cons |
|----------|-------------|------|------|
| **CRAFT** ([paper](https://arxiv.org/abs/1904.01941)) | Character Region Awareness for Text detection. Neural network that detects text regions. | Accurate, handles curved/skewed text | ~20MB model, extra dependency, slower on CPU |
| **Horizontal projection** | Simple image processing: binarise → horizontal projection profile → split at valleys | Fast, no ML model, minimal dependencies | Brittle with skewed text or variable spacing |
| **Contour-based** | OpenCV: threshold → find contours → merge into line bounding boxes | Moderate accuracy, no model needed | Requires tuning for reMarkable's lined paper |

**Recommendation: Horizontal projection profile** as the initial approach, since reMarkable notes are on lined paper with consistent horizontal text. This avoids adding a second ML model to the Pi. If accuracy is insufficient, upgrade to CRAFT later.

### Alternative: Tesseract

| | TrOCR-small | Tesseract 5 |
|---|---|---|
| Handwriting quality | Strong (trained on IAM handwriting dataset) | Poor for handwriting (designed for printed text) |
| Model size | ~234 MB | ~15 MB (eng.traineddata) |
| Dependencies | transformers, torch, PIL | system package (tesseract-ocr) |
| CPU inference speed | Slower (~1-3s/line on ARM) | Faster (~0.5s/page) |
| Setup complexity | pip install | apt install |

Tesseract is lighter but produces poor results on handwriting. TrOCR is the right choice for handwritten notes.

### Alternative: Cloud API

A cloud vision API (Google Cloud Vision, AWS Textract) would give the best accuracy with zero local compute, but adds cost, requires API keys, and sends personal notes to third-party services. Out of scope for this design but noted as a fallback if on-device quality is unacceptable.

## Implementation Detail

### New File: `server/ocr.py`

```python
# Core OCR module
# - pdf_to_images(pdf_bytes) -> list[PIL.Image]
# - segment_lines(image) -> list[PIL.Image]
# - recognise_lines(line_images) -> list[str]
# - ocr_pdf(pdf_bytes) -> str
```

### Integration Point: `server/remarkable_sync.py`

After a successful `_copy_file()` call in `run_sync()`, if the file is a PDF:

```python
if file_name.lower().endswith(".pdf"):
    txt_content = await run_ocr(tokens, dest_path)
    if txt_content:
        txt_path = dest_path.rsplit(".", 1)[0] + ".txt"
        await _upload_text(tokens, txt_path, txt_content)
```

### PDF to Images

Use **PyMuPDF** (`fitz`) to render PDF pages to PIL Images. It's a pure-Python library with no system dependencies (unlike `pdf2image` which needs `poppler`).

```python
import fitz  # PyMuPDF

def pdf_to_images(pdf_bytes: bytes) -> list[Image.Image]:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    images = []
    for page in doc:
        pix = page.get_pixmap(dpi=200)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        images.append(img)
    return images
```

### Line Segmentation (Horizontal Projection)

```python
import numpy as np
from PIL import Image

def segment_lines(image: Image.Image, min_gap: int = 15) -> list[Image.Image]:
    """Split a page image into individual text lines using horizontal projection."""
    gray = np.array(image.convert("L"))
    binary = (gray < 180).astype(np.uint8)  # dark pixels = text
    projection = binary.sum(axis=1)

    # Find line boundaries: regions where projection > threshold
    threshold = projection.max() * 0.02
    in_line = projection > threshold

    lines = []
    start = None
    for i, val in enumerate(in_line):
        if val and start is None:
            start = i
        elif not val and start is not None:
            if i - start > min_gap:  # filter tiny noise regions
                lines.append(image.crop((0, start, image.width, i)))
            start = None
    if start is not None:
        lines.append(image.crop((0, start, image.width, len(in_line))))

    return lines
```

### Text Recognition

```python
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

# Loaded once at module level (lazy init)
_processor = None
_model = None

def _load_model():
    global _processor, _model
    if _processor is None:
        _processor = TrOCRProcessor.from_pretrained("microsoft/trocr-small-handwritten")
        _model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-small-handwritten")
    return _processor, _model

def recognise_lines(line_images: list[Image.Image]) -> list[str]:
    processor, model = _load_model()
    results = []
    for img in line_images:
        pixel_values = processor(images=img, return_tensors="pt").pixel_values
        generated_ids = model.generate(pixel_values)
        text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
        results.append(text)
    return results
```

### Upload Result to Dropbox

```python
async def _upload_text(tokens: dict, path: str, content: str) -> None:
    """Upload a text string as a file to Dropbox."""
    import json as _json
    await _dropbox_request(
        "POST",
        "https://content.dropboxapi.com/2/files/upload",
        tokens,
        headers={
            "Dropbox-API-Arg": _json.dumps({
                "path": path,
                "mode": "overwrite",
                "autorename": False,
            }),
            "Content-Type": "application/octet-stream",
        },
        content=content.encode("utf-8"),
    )
```

## Container Changes

### Additional Python Dependencies

Add to `server/requirements.txt`:

```
transformers>=4.40.0
torch>=2.2.0         # CPU-only; PyTorch has ARM64 wheels
Pillow>=10.0.0
PyMuPDF>=1.24.0
numpy>=1.26.0
```

### Containerfile Changes

The `python:3.12-slim` base image is sufficient. PyTorch CPU-only wheels are available for ARM64 Linux. No system packages need adding.

**Disk impact:** The container image will grow by approximately:
- PyTorch CPU (ARM64): ~150 MB
- transformers: ~5 MB
- PyMuPDF: ~15 MB
- Model download (first run, cached): ~234 MB

**Total additional disk: ~400 MB** (the model is downloaded at first inference and cached in the container's filesystem or a mounted volume).

### Model Caching Strategy

The TrOCR model should be downloaded once and cached. Options:

1. **Runtime download** (simplest): Model downloads on first OCR request. Cache in `/app/data/models/`. This directory is already a mounted volume (`./data:/app/data`), so the model persists across container restarts.

2. **Build-time download** (faster cold start but bigger image): Add `RUN python -c "from transformers import ..."` to Containerfile. Increases image size by ~234 MB but eliminates first-run delay.

**Recommendation: Option 1 (runtime download)** — keeps the image small and the model persists via the volume mount.

Set the cache directory via environment variable:
```
TRANSFORMERS_CACHE=/app/data/models
```

## Performance Estimate (Pi 4, CPU)

| Step | Time (est.) |
|------|-------------|
| Download PDF from Dropbox | ~1-2s (small file) |
| PDF → image (1 page, 200 DPI) | ~0.5s |
| Line segmentation | ~0.1s |
| TrOCR per line (~15 lines) | ~15-45s (1-3s per line) |
| Upload .txt to Dropbox | ~1s |
| **Total per page** | **~20-50s** |

This is acceptable for an async background process. Notes are typically 1 page. Multi-page notes will take proportionally longer.

### Memory Usage

- TrOCR-small model in memory: ~500 MB (float32) or ~250 MB (float16)
- Page image at 200 DPI: ~5-10 MB
- Peak during inference: ~700 MB - 1 GB

**Real-world headroom (doylestonex):**
- Available RAM with 6 containers running: **~3.0 GiB**
- Peak OCR usage (float32): ~1 GB → leaves ~2 GB for existing services
- Peak OCR usage (float16): ~500 MB → leaves ~2.5 GB for existing services
- Swap available: 464 MiB free (safety net)

This is feasible but not generous. **float16 inference is recommended** to keep headroom comfortable.

**Mitigations:**
1. Use float16 inference (halves model memory, negligible quality loss)
2. Unload model after OCR completes (`del model; gc.collect(); torch.cuda.empty_cache()`)
3. Process OCR asynchronously — don't block the sync loop if memory is tight
4. Add a memory check before loading the model; skip OCR if available RAM < 1.5 GB

## API Changes

### New Endpoint: `POST /api/remarkable/ocr`

Trigger OCR on a specific file (manual re-run):

```json
POST /api/remarkable/ocr
{
  "path": "/DropsyncFiles/jw-mind/_remarkable-emails-via-browsernotes/random/2026-02-13-W07-Fri/random.pdf"
}

Response:
{
  "status": "completed",
  "text_path": "/DropsyncFiles/.../random.txt",
  "lines": 15,
  "text": "13.02.26 - Perfect words...\n\nI read quite an informative and..."
}
```

### Extended Sync Log Entry

```json
{
  "timestamp": "2026-02-13T14:30:00Z",
  "file_name": "random.pdf",
  "source_path": "/Email Attachments/random.pdf",
  "dest_path": "/DropsyncFiles/.../random.pdf",
  "status": "copied",
  "size_bytes": 76800,
  "ocr_status": "completed",
  "ocr_text_path": "/DropsyncFiles/.../random.txt",
  "ocr_lines": 15,
  "ocr_duration_seconds": 35.2
}
```

### Config Extension

```json
{
  "remarkable_sync": {
    "enabled": true,
    "ocr_enabled": true,
    "ocr_model": "microsoft/trocr-small-handwritten",
    ...
  }
}
```

## Frontend Changes

### Settings Panel

Add an "OCR" toggle beneath the existing reMarkable sync controls:

```
reMarkable Sync
─────────────────────────────────
[Toggle] Enable sync              [ON]
[Toggle] Enable OCR               [ON]

Recent Activity
───────────────
  14:30  random.pdf      copied + OCR   76KB   35s
  14:30  focus.pdf       copied + OCR   120KB  42s
```

### Note View

When viewing a synced note that has a corresponding `.txt` file, show the OCR text below or alongside the PDF preview.

## Testing

### Unit Tests (`tests/test_ocr.py`)

- `test_pdf_to_images` — converts a sample PDF to PIL images
- `test_segment_lines` — splits a page image into expected number of lines
- `test_recognise_lines` — (mocked model) returns text for line images
- `test_ocr_pdf_end_to_end` — full pipeline from PDF bytes to text string
- `test_ocr_skips_non_pdf` — non-PDF files are ignored
- `test_ocr_handles_empty_page` — blank page returns empty string
- `test_ocr_upload_creates_txt` — verifies .txt uploaded to correct Dropbox path

### Integration Test

Use the actual sample note (`random.pdf` from 2026-02-13) as a test fixture. Compare OCR output against expected text to catch regressions.

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| TrOCR quality poor on personal handwriting | Medium | High | Test with real notes early. Fall back to trocr-base if quality is unacceptable (will need memory management). |
| PyTorch too large for Pi SD card | Low | High | Use CPU-only torch. Prune unused backends. Consider ONNX Runtime as lighter alternative. |
| Inference too slow (>2min/page) | Medium | Low | Acceptable for background task. Could batch process during quiet hours. |
| Line segmentation fails on messy pages | Medium | Medium | Horizontal projection works well for reMarkable's lined paper. Fall back to CRAFT if needed. |
| Model download fails on first run | Low | Low | Retry logic. Manual download endpoint. Pre-cache in volume. |
| Memory pressure crashes other containers | Medium | High | Monitor memory. Unload model after use. Use float16. Consider running OCR on only the Pi when other containers are idle. |

## Future Considerations (Out of Scope)

- **ONNX Runtime** as a lighter inference backend (smaller than PyTorch, better ARM support)
- **Batch OCR** for existing unprocessed notes (backfill)
- **CRAFT-based line detection** if projection-based segmentation is insufficient
- **Searchable PDF** output (embedding OCR text layer into the PDF) via `pikepdf`
- **Confidence scores** per line to flag low-quality recognition
- **Language model post-processing** to correct common OCR errors
- **Webhook trigger** instead of polling-based OCR

## File Changes Summary

| File | Change |
|------|--------|
| `server/ocr.py` | **New** — OCR pipeline (pdf→images→lines→text) |
| `server/remarkable_sync.py` | Add OCR post-processing after file copy |
| `server/requirements.txt` | Add transformers, torch, Pillow, PyMuPDF, numpy |
| `Containerfile` | Add `TRANSFORMERS_CACHE` env var |
| `deploy/podman-pi/docker-compose.yml` | Add `TRANSFORMERS_CACHE` env mapping |
| `web/WebDropboxClient.ts` | Add OCR trigger method |
| `web/SettingsPanel.ts` | Add OCR toggle |
| `tests/test_ocr.py` | **New** — OCR unit tests |

## Implementation Plan

Organised by logical commit for a clean history.

---

### Commit 1: Add OCR pipeline core module

> `Add OCR pipeline: pdf-to-images, line segmentation, TrOCR recognition`

**New file: `server/ocr.py`**

Four public functions:

1. `pdf_to_images(pdf_bytes) -> list[Image]` — PyMuPDF (`fitz`) renders each page at 200 DPI to a PIL Image. `fitz` imported inside function body (deferred import).

2. `segment_lines(image, min_line_height=15) -> list[Image]` — Converts to grayscale, binarises (threshold < 180), computes horizontal projection profile, finds contiguous rows with ink above 2% of max projection, crops each row as a separate line image. No ML model needed.

3. `recognise_lines(line_images) -> list[str]` — Calls `_load_model()` to lazy-init TrOCR. Processes one line at a time: `processor(images=img, return_tensors="pt").pixel_values.half()` → `model.generate()` → `processor.batch_decode()`. Uses `torch.no_grad()`.

4. `ocr_pdf(pdf_bytes, progress_callback=None) -> str` — Orchestrator: calls `pdf_to_images` → for each page, `segment_lines` → `recognise_lines` (calling `progress_callback(lines_done, total_lines)` after each line) → joins all text. Calls `_unload_model()` in `finally` block. Returns empty string on any exception.

Internal helpers:
- `_load_model()` — imports `torch` and `transformers` inside function. Loads `microsoft/trocr-small-handwritten` with `torch_dtype=torch.float16`, calls `model.eval()`. Caches in module globals `_processor`/`_model`.
- `_unload_model()` — sets globals to None, calls `gc.collect()`.

**New file: `tests/test_ocr.py`**

Tests (mocked ML deps — no model download):
- `test_pdf_to_images` — mock `fitz` module via `sys.modules`, verify PIL Images returned
- `test_segment_lines_detects_text_rows` — real numpy/PIL: create 200x100 white image with two dark bands, assert 2 lines
- `test_segment_lines_empty_page` — blank white image → 0 lines
- `test_recognise_lines_returns_text` — mock `_load_model` returning mock processor/model, verify decoded text
- `test_recognise_lines_empty_input` — empty list → empty list (no model loaded)
- `test_ocr_pdf_end_to_end` — mock `pdf_to_images`, `segment_lines`, `recognise_lines`, verify joined output
- `test_ocr_pdf_handles_error` — `pdf_to_images` raises → returns empty string

**Edit: `server/requirements.txt`**

Append:
```
transformers>=4.40.0
torch>=2.2.0
Pillow>=10.0.0
PyMuPDF>=1.24.0
numpy>=1.26.0
```

**Files:** `server/ocr.py` (new), `tests/test_ocr.py` (new), `server/requirements.txt` (edit)

---

### Commit 2: Integrate OCR into reMarkable sync pipeline

> `Integrate OCR into reMarkable sync: auto-OCR after copy, manual /ocr endpoint`

**Edit: `server/remarkable_sync.py`**

Add import at top:
```python
from server.ocr import ocr_pdf
```

Add three helper functions after `_copy_file()` (~line 112):

1. `_download_file(tokens, path) -> bytes` — POST to `content.dropboxapi.com/2/files/download` with `Dropbox-API-Arg` header containing `{"path": path}`. Returns `response.content`.

2. `_upload_text(tokens, path, content)` — POST to `content.dropboxapi.com/2/files/upload` with `Dropbox-API-Arg` header containing `{"path": path, "mode": "overwrite", "autorename": false, "mute": true}`, body is `content.encode("utf-8")`.

3. `_run_ocr_for_file(tokens, dest_path, config, now)` — Async background function:
   - Downloads PDF via `_download_file`
   - Runs `ocr_pdf` in thread executor: `await loop.run_in_executor(None, ocr_pdf, pdf_bytes)`
   - If text produced, uploads `.txt` via `_upload_text` (path = `dest_path` with `.pdf` → `.txt`)
   - Updates matching sync log entry with `ocr_status`, `ocr_text_path`, `ocr_lines`
   - All exceptions caught internally (OCR failure never breaks sync)

Hook into `run_sync()` after successful `_copy_file` call (~line 243):
```python
if file_name.lower().endswith(".pdf") and config.get("ocr_enabled", True):
    asyncio.create_task(_run_ocr_for_file(tokens, dest_path, config, now))
```

New endpoint `POST /api/remarkable/ocr`:
- Auth required
- Takes `{"path": "/...pdf"}`, rejects non-PDF
- Downloads PDF, runs OCR synchronously (in executor), uploads `.txt`
- Returns `{"status", "text_path", "lines", "text"}`

Extend existing endpoints:
- `GET /api/remarkable/status` — add `"ocr_enabled": config.get("ocr_enabled", True)` to response
- `POST /api/remarkable/config` — accept and save `ocr_enabled` boolean

**Edit: `tests/test_ocr.py`** (append endpoint tests)

- `test_ocr_endpoint_requires_auth` — POST `/api/remarkable/ocr` without session → 401
- `test_ocr_endpoint_rejects_non_pdf` — path not ending `.pdf` → 400
- `test_ocr_endpoint_success` — mock `_dropbox_request` + `ocr_pdf`, verify 200 response with text_path and text
- `test_ocr_config_toggle` — POST config with `ocr_enabled: false`, GET status shows `ocr_enabled: false`

**Files:** `server/remarkable_sync.py` (edit), `tests/test_ocr.py` (edit)

---

### Commit 3: Add OCR progress log file on Dropbox

> `Add OCR progress log file written to Dropbox destination folder`

**Edit: `server/remarkable_sync.py`**

Add helper:
- `_append_progress_log(tokens, dest_folder, message)` — Downloads `{dest_folder}/_ocr-progress.log` from Dropbox (or starts empty if not found), appends `[{timestamp}] {message}\n`, trims to last 200 lines, re-uploads.

Update `_run_ocr_for_file()`:
- Extract `dest_folder` from config (the remarkable sync dest root)
- Log `"{file_name} — OCR started"` before starting
- Pass a `progress_callback` to `ocr_pdf()` that logs at 25%, 50%, 75% thresholds:
  ```
  random.pdf — 25% (4/15 lines)
  random.pdf — 50% (8/15 lines)
  random.pdf — 75% (12/15 lines)
  ```
- Log `"{file_name} — completed ({n} lines, {t}s) -> {txt_name}"` on success
- Log `"{file_name} — error: {message}"` on failure

The progress callback in `_run_ocr_for_file` needs to call an async function from a sync context (since `ocr_pdf` runs in a thread executor). Solution: the callback schedules the Dropbox upload onto the event loop via `asyncio.run_coroutine_threadsafe(coro, loop)`.

**Edit: `tests/test_ocr.py`** (append progress log tests)

- `test_progress_log_written_on_ocr` — mock Dropbox download/upload, run OCR, verify log file uploaded with expected entries
- `test_progress_log_capped_at_200_lines` — prepopulate with 200 lines, verify oldest trimmed

**Files:** `server/remarkable_sync.py` (edit), `tests/test_ocr.py` (edit)

---

### Commit 4: Add OCR toggle to frontend settings

> `Add OCR toggle and log badges to reMarkable settings UI`

**Edit: `web/WebDropboxClient.ts`**

Update interfaces:
- `RemarkableSyncStatus` — add `ocr_enabled: boolean`
- `RemarkableSyncConfig` — add `ocr_enabled: boolean`
- `SyncLogEntry` — add optional `ocr_status?: string`, `ocr_text_path?: string`, `ocr_lines?: number`

Add interface:
```typescript
export interface RemarkableOcrResult {
  status: string;
  text_path: string | null;
  lines: number;
  text: string;
}
```

Add method:
```typescript
async triggerRemarkableOcr(path: string): Promise<RemarkableOcrResult>
```

**Edit: `web/SettingsPanel.ts`**

In `createPanel()` HTML (~line 91), after the "Enable sync" toggle:
```html
<div class="settings-field">
  <label>
    <input type="checkbox" id="remarkableOcrToggle" />
    Enable OCR (handwriting to text)
  </label>
</div>
```

Wire up:
- Add change event listener for `#remarkableOcrToggle` → calls `saveRemarkableConfig()` (after line 146)
- In `refreshRemarkableStatus()` (~line 347): set `ocrToggle.checked = status.ocr_enabled`
- In `saveRemarkableConfig()` (~line 384): include `ocr_enabled: ocrToggle.checked` in config payload

In `renderRemarkableLog()` (~line 369): show an "OCR" badge when `e.ocr_status === 'completed'`:
```typescript
const ocrBadge = e.ocr_status === 'completed'
  ? '<span class="remarkable-log-ocr">OCR</span>' : '';
```

**Files:** `web/WebDropboxClient.ts` (edit), `web/SettingsPanel.ts` (edit)

---

### Commit 5: Update container config for OCR model caching

> `Add TRANSFORMERS_CACHE env var for OCR model persistence`

**Edit: `Containerfile`**

After `RUN mkdir -p /app/data` (line 33), add:
```dockerfile
ENV TRANSFORMERS_CACHE=/app/data/models
```

This ensures the HuggingFace model (~234 MB) is cached in the persistent volume (`./data:/app/data`) and survives container rebuilds. First OCR request downloads the model; subsequent requests use the cache.

**Files:** `Containerfile` (edit)

---

## Verification

After all commits:

```bash
# Run OCR unit tests
python -m pytest tests/test_ocr.py -v

# Run full test suite (regression)
python -m pytest tests/ -v

# Build container locally to verify Containerfile
podman build -f Containerfile -t browsernotes-api:test .

# Deploy to Pi and test manually
./deploy/podman-pi/deploy-doylestonex.sh

# Trigger manual OCR via curl (after deploy)
curl -X POST https://howapped.zapto.org/browsernotes/api/remarkable/ocr \
  -H "Content-Type: application/json" \
  -d '{"path": "/DropsyncFiles/jw-mind/_remarkable-emails-via-browsernotes/random/2026-02-13-W07-Fri/random.pdf"}' \
  --cookie "session=..."

# Check progress log on Dropbox
# Open _remarkable-emails-via-browsernotes/_ocr-progress.log in Obsidian
```

## References

- [TrOCR paper](https://arxiv.org/abs/2109.10282) — Transformer-based OCR with Pre-trained Models
- [microsoft/trocr-small-handwritten](https://huggingface.co/microsoft/trocr-small-handwritten) — Hugging Face model card
- [TrOCR + CRAFT for multi-line HTR](https://discuss.huggingface.co/t/how-to-do-full-page-analysis-with-trocr-integrating-with-text-segmentation-analysis/39416) — Hugging Face discussion on full-page analysis
- [CRAFT text detection](https://arxiv.org/abs/1904.01941) — Character Region Awareness for Text detection
- [TrOCR Getting Started](https://learnopencv.com/trocr-getting-started-with-transformer-based-ocr/) — LearnOpenCV tutorial
- [rsommerfeld/trocr](https://github.com/rsommerfeld/trocr) — Unofficial TrOCR implementation with multi-line support
