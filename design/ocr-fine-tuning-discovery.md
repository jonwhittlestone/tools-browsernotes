# Discovery: Fine-Tuning TrOCR on Personal Handwriting Corrections

## Problem

The TrOCR-small-handwritten model produces usable but imperfect OCR for reMarkable handwritten notes. Common errors include misrecognized characters specific to the author's handwriting style (e.g., "Men" instead of "Then", "Byet" instead of "Bye!"). Since the author already corrects `.txt` files after OCR, these corrections represent free training data that could improve the model over time.

**Question**: Can we close the loop — use corrected text to fine-tune TrOCR for better recognition of this specific handwriting?

## TL;DR

Yes. The technique is called **human-in-the-loop domain adaptation**. LoRA fine-tuning on ~300 corrected line pairs (15-30 pages) should produce noticeable improvement. Training happens offline on an AMD desktop (CPU-only, ~2-6 hours). The fine-tuned model deploys back to the Pi 4 with no architecture changes.

## How TrOCR Works (Background)

TrOCR-small-handwritten is a 62M parameter encoder-decoder model:

- **Encoder**: DeiT-Small (Vision Transformer) — processes a 384x384 image of a single text line
- **Decoder**: MiniLM (compact UniLM) — autoregressively generates text tokens
- Pre-trained on synthetic handwriting data, then fine-tuned on the IAM Handwriting Database (~9,000 lines)

The model already knows how to read handwriting in general. Fine-tuning adapts it to one person's specific style — a much easier task than training from scratch.

## The Feedback Loop

```
                    ┌─────────────────────────────┐
                    │  reMarkable PDF synced to    │
                    │  Dropbox via browsernotes    │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │  OCR pipeline (Pi 4)         │
                    │  segment_lines → recognise   │
                    │                              │
                    │  Outputs:                    │
                    │   - note.txt (OCR text)      │
                    │   - note_lines/ (line imgs)  │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │  Author corrects note.txt    │
                    │  in Obsidian / text editor   │
                    │  Saves as note_corrected.txt │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │  Training data collector     │
                    │  Pairs line images with      │
                    │  corrected text              │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │  Offline fine-tuning         │
                    │  (doylestone02 AMD desktop)  │
                    │  LoRA + Seq2SeqTrainer       │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │  Deploy fine-tuned model     │
                    │  back to Pi 4                │
                    └─────────────────────────────┘
```

This pattern is known as **human-in-the-loop (HITL) learning** or **domain adaptation via user feedback**. Related concepts:

- **Active learning** — model selects uncertain examples for human review (a future enhancement)
- **Incremental learning** — model updates continuously as corrections arrive
- **Transfer learning** — leveraging pre-trained weights rather than training from scratch

## Training Data: How It Works

### What the model needs

Each training example is a **(line image, correct text)** pair — one cropped image of a single handwritten line, paired with the exact text it contains.

### How to collect pairs

During OCR, save the segmented line images alongside the text:

```
journal (3)/
  line_001.png          # Cropped image of line 1
  line_002.png          # Cropped image of line 2
  ...
journal (3).txt         # Original OCR output (one line per image)
journal (3).txt.orig    # Preserved original for diff
```

The author edits `journal (3).txt` to fix errors. The corrected file must preserve line count and order — each line N in the text corresponds to `line_N.png`.

A collector script then builds training pairs:

```python
pairs = []
for img_path, corrected_text in zip(line_images, corrected_lines):
    if corrected_text.strip():  # skip paragraph breaks
        pairs.append((img_path, corrected_text))
```

### How many corrections are needed

| Corrected pages | ~Line pairs | Expected outcome |
|----------------|-------------|------------------|
| 5-10           | 75-150      | Slight improvement, risk of overfitting |
| **15-30**      | **225-450** | **Practical sweet spot for personal adaptation** |
| 50+            | 750+        | Strong improvement |
| 100+           | 1,500+      | Diminishing returns for single-person handwriting |

Include lines the model got right (not just corrections) to maintain general capability. A 70/30 mix of correct/corrected lines is recommended.

## Fine-Tuning Approach: LoRA

### Why LoRA over full fine-tuning

**LoRA (Low-Rank Adaptation)** freezes the original model weights and trains small adapter matrices injected into attention layers. For this use case, LoRA is strictly better than full fine-tuning:

| Aspect | Full fine-tuning | LoRA |
|--------|-----------------|------|
| Trainable parameters | 62M (100%) | ~0.5-1M (~1%) |
| Training memory | 2-4 GB | 0.5-1.5 GB |
| Catastrophic forgetting risk | High with small datasets | Low by construction |
| Model storage | 248 MB new model | 2-4 MB adapter |
| Rollback | Keep both models | Remove adapter = original |

The [DLoRA-TrOCR paper](https://arxiv.org/html/2404.12734v3) showed LoRA with only 0.6% of parameters trainable **outperformed full fine-tuning** on CER while using 35% less memory.

### Training code sketch

```python
from transformers import (
    TrOCRProcessor, VisionEncoderDecoderModel,
    Seq2SeqTrainer, Seq2SeqTrainingArguments,
    default_data_collator,
)
from peft import LoraConfig, get_peft_model, TaskType
from evaluate import load as load_metric

# Load model + processor
processor = TrOCRProcessor.from_pretrained("microsoft/trocr-small-handwritten")
model = VisionEncoderDecoderModel.from_pretrained("microsoft/trocr-small-handwritten")

# Apply LoRA
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["q_proj", "v_proj", "k_proj", "out_proj"],
    lora_dropout=0.1,
    bias="none",
    task_type=TaskType.SEQ_2_SEQ_LM,
)
model = get_peft_model(model, lora_config)
# ~0.5-1M trainable out of 62M total

# Training arguments
training_args = Seq2SeqTrainingArguments(
    output_dir="./trocr-lora-finetuned",
    predict_with_generate=True,
    per_device_train_batch_size=4,
    learning_rate=5e-5,
    num_train_epochs=10,
    weight_decay=0.01,
    warmup_steps=100,
    eval_steps=200,
    save_steps=200,
    fp16=False,  # CPU training — no fp16
)

# Train
trainer = Seq2SeqTrainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,  # OCRDataset with (line_image, text) pairs
    eval_dataset=eval_dataset,
    data_collator=default_data_collator,
    compute_metrics=compute_cer,
)
trainer.train()
```

### Evaluation metric

**Character Error Rate (CER)** — the standard metric for OCR:

```python
cer_metric = load_metric("cer")
# CER = edit_distance(predicted, reference) / len(reference)
# Lower is better. TrOCR-small achieves ~4.2% CER on IAM test set.
```

Track CER on both personal test data AND IAM samples. If IAM CER increases significantly during training, catastrophic forgetting is occurring.

## Hardware: Where to Train

### Raspberry Pi 4 (doylestonex) — inference only

- 4 cores ARM Cortex-A72, 3.7 GB RAM
- Sufficient for inference (~6s model load, ~3min OCR for 15 lines)
- **Not viable for training** — would swap heavily, hours per epoch

### AMD Desktop (doylestone02) — training machine

- CPU-only training is practical for 62M parameters
- **Estimated time**: 500 examples, 10 epochs, batch size 4 = ~2-6 hours on a modern Ryzen
- RAM needed: ~2-4 GB (well within typical 16-32 GB desktop RAM)
- No GPU required. AMD integrated graphics cannot be used for PyTorch training (ROCm APU support is limited to newest Ryzen AI 300+ series)

### Cloud alternative

Google Colab provides free T4 GPUs — more than sufficient for TrOCR-small. Training would complete in ~30 minutes. Worth considering if desktop training proves too slow.

## Deploying the Fine-Tuned Model

After training on the desktop:

```python
# Merge LoRA adapter into base model (no peft dependency needed at inference)
merged_model = model.merge_and_unload()
merged_model.save_pretrained("./trocr-finetuned-merged", safe_serialization=True)
processor.save_pretrained("./trocr-finetuned-merged")
```

Copy to the Pi and update `ocr.py`:

```python
# Make model path configurable
model_name = os.environ.get("OCR_MODEL", "microsoft/trocr-small-handwritten")
```

The merged model is the same size (~248 MB) and loads identically to the original — no extra dependencies on the Pi.

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Catastrophic forgetting (model forgets general handwriting) | LoRA preserves base weights; mix in IAM samples; monitor CER on held-out general data |
| Overfitting on small dataset | LoRA limits trainable params; data augmentation (rotation, brightness jitter); early stopping |
| Line alignment breaks if user reformats text | Enforce same-line-count rule; save `.orig` for diff-based alignment recovery |
| Training data too homogeneous (same paper, same pen) | Augment with brightness/contrast/rotation variations |
| Model gets worse, not better | Always keep original model; A/B test before deploying; easy rollback (remove adapter or revert env var) |

## Implementation Phases

### Phase 1: Save line images during OCR (prerequisite)

Modify `ocr_pdf()` to save numbered line images alongside the `.txt` file. Upload to Dropbox so they sync to the author's machine.

### Phase 2: Training data collection

Build a script that reads corrected `.txt` files, aligns them with saved line images, and produces a training dataset (image paths + text labels).

### Phase 3: Fine-tuning pipeline

Create a training script for doylestone02 using LoRA + Seq2SeqTrainer. Takes a training dataset directory, outputs a merged model.

### Phase 4: Model deployment

Copy the fine-tuned model to the Pi. Make `OCR_MODEL` configurable via environment variable. Redeploy.

### Phase 5 (future): Automated feedback loop

- Detect when a corrected `.txt` differs from the original
- Automatically extract new training pairs
- Trigger retraining when enough new pairs accumulate (e.g., every 50 new corrections)

## References

- [TrOCR fine-tuning tutorial (Seq2SeqTrainer)](https://github.com/NielsRogge/Transformers-Tutorials/blob/master/TrOCR/Fine_tune_TrOCR_on_IAM_Handwriting_Database_using_Seq2SeqTrainer.ipynb)
- [DLoRA-TrOCR: LoRA/DoRA for TrOCR](https://arxiv.org/html/2404.12734v3)
- [LearnOpenCV: Fine-tuning TrOCR](https://learnopencv.com/fine-tuning-trocr-training-trocr-to-recognize-curved-text/)
- [microsoft/trocr-small-handwritten model card](https://huggingface.co/microsoft/trocr-small-handwritten)
- [Hugging Face PEFT library](https://github.com/huggingface/peft)
