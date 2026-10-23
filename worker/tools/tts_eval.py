"""Đo khách quan các file TTS: nhịp nghỉ, cao độ, phổ, độ to, (tuỳ chọn) WER.

Chạy bằng venv của VieNeu (có librosa/soundfile/transformers):

    worker/.venv-vieneu/Scripts/python.exe worker/tools/tts_eval.py worker/output/tts-eval/x1
    worker/.venv-vieneu/Scripts/python.exe worker/tools/tts_eval.py worker/output/tts-eval/x1 --asr

--asr dùng PhoWhisper-small (tiếng Việt) để chép lại audio và tính WER/CER so với
TEXT. Lần đầu sẽ tải model (~950MB) về cache HuggingFace.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

import numpy as np

SR = 24000
SILENCE_DB = -40.0
SILENCE_MIN_SEC = 0.15

TEXT = (
    "Trời vừa tối, hắn đã có mặt ở đầu con hẻm. Ngõ nhỏ, ẩm ướt, hai bên là những "
    "bức tường loang lổ. Hắn dừng lại, nghe ngóng. Phía trong vọng ra tiếng nói: "
    "“Đi nhanh lên, sắp muộn rồi.” Hắn nhíu mày, tự hỏi: rốt cuộc chuyện này là sao? "
    "Ba ngày trước, mọi thứ vẫn còn bình thường."
)


def _load(path: Path) -> np.ndarray:
    import librosa

    y, _ = librosa.load(str(path), sr=SR, mono=True)
    return y


def _pauses(y: np.ndarray) -> list:
    frame = int(0.02 * SR)
    count = len(y) // frame
    if count == 0:
        return []
    frames = np.abs(y[: count * frame]).reshape(count, frame)
    db = 20 * np.log10(np.maximum(frames.mean(axis=1), 1e-9))
    peak = float(np.percentile(db, 95))
    silent = db < max(SILENCE_DB, peak - 35)
    runs, start = [], None
    for i, flag in enumerate(silent):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            runs.append((start, i))
            start = None
    if start is not None:
        runs.append((start, count))
    seconds = [round((end - begin) * frame / SR, 2) for begin, end in runs]
    # bỏ im lặng đầu/cuối file, giữ khoảng nghỉ bên trong
    if seconds and runs[0][0] == 0:
        seconds = seconds[1:]
    if seconds and runs[-1][1] >= count - 1:
        seconds = seconds[:-1]
    return [s for s in seconds if s >= SILENCE_MIN_SEC]


def _spectrum(y: np.ndarray) -> dict:
    spec = np.abs(np.fft.rfft(y * np.hanning(len(y))))
    freqs = np.fft.rfftfreq(len(y), 1 / SR)
    power = spec**2
    total = power.sum() or 1.0
    cum = np.cumsum(power) / total
    rolloff = float(freqs[np.searchsorted(cum, 0.95)])
    ratios = {}
    for band in (4000, 6000, 8000, 12000):
        ratios[band] = round(float(power[freqs >= band].sum() / total * 100), 2)
    return {"rolloff95": round(rolloff), "energy_gt_4k_pct": ratios[4000],
            "energy_gt_8k_pct": ratios[8000], "energy_gt_12k_pct": ratios[12000]}


def _f0(y: np.ndarray) -> dict:
    import librosa

    f0, voiced, _ = librosa.pyin(y, fmin=70, fmax=400, sr=SR, frame_length=1024)
    values = f0[~np.isnan(f0)]
    if values.size == 0:
        return {}
    return {
        "f0_med": round(float(np.median(values)), 1),
        "f0_std": round(float(np.std(values)), 1),
        "f0_p5_p95": f"{np.percentile(values, 5):.0f}-{np.percentile(values, 95):.0f}",
        "voiced_pct": round(float(voiced.mean() * 100), 0),
    }


def _loudness(y: np.ndarray) -> dict:
    peak = float(np.max(np.abs(y))) if y.size else 0.0
    rms = float(np.sqrt(np.mean(y**2))) if y.size else 0.0
    clipped = int(np.sum(np.abs(y) >= 0.999))
    return {
        "peak_dbfs": round(20 * np.log10(max(peak, 1e-9)), 1),
        "rms_dbfs": round(20 * np.log10(max(rms, 1e-9)), 1),
        "clipped_samples": clipped,
    }


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFC", text).lower()
    text = re.sub(r"[^\w\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _edit_distance(a: list, b: list) -> int:
    if len(a) < len(b):
        a, b = b, a
    previous = list(range(len(b) + 1))
    for i, item_a in enumerate(a, 1):
        current = [i]
        for j, item_b in enumerate(b, 1):
            cost = 0 if item_a == item_b else 1
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost))
        previous = current
    return previous[-1]


def _wer(hyp: str, ref: str) -> dict:
    ref_words, hyp_words = _normalize(ref).split(), _normalize(hyp).split()
    ref_chars, hyp_chars = list(_normalize(ref).replace(" ", "")), list(_normalize(hyp).replace(" ", ""))
    wer = _edit_distance(hyp_words, ref_words) / max(1, len(ref_words))
    cer = _edit_distance(hyp_chars, ref_chars) / max(1, len(ref_chars))
    return {"wer_pct": round(wer * 100, 1), "cer_pct": round(cer * 100, 1)}


def _transcribe(paths: list, asr) -> dict:
    out = {}
    for path in paths:
        try:
            result = asr(str(path), generate_kwargs={"language": "vi", "task": "transcribe"})
            out[path.name] = result["text"].strip()
        except Exception as exc:  # noqa: BLE001
            out[path.name] = f"__ERROR__ {type(exc).__name__}: {exc}"
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("folder")
    parser.add_argument("--asr", action="store_true", help="bật WER/CER bằng PhoWhisper-small")
    parser.add_argument("--text-file", help="file .txt chứa text gốc để tính WER")
    parser.add_argument("--json", action="store_true", help="in JSON thay vì bảng")
    args = parser.parse_args()

    global TEXT
    if args.text_file:
        TEXT = Path(args.text_file).read_text(encoding="utf-8").strip()

    folder = Path(args.folder)
    paths = sorted(folder.glob("*.mp3"))
    if not paths:
        print(f"không có mp3 trong {folder}")
        return 1

    asr = None
    if args.asr:
        import torch
        from transformers import pipeline

        device = 0 if torch.cuda.is_available() else -1
        print("nạp PhoWhisper-small...", flush=True)
        asr = pipeline(
            "automatic-speech-recognition",
            model="vinai/PhoWhisper-small",
            device=device,
            chunk_length_s=30,
        )

    rows = []
    transcripts = _transcribe(paths, asr) if asr else {}
    for path in paths:
        y = _load(path)
        pauses = _pauses(y)
        row = {
            "file": path.name,
            "dur_s": round(len(y) / SR, 1),
            "chars_per_s": round(len(TEXT) / max(len(y) / SR, 1e-9), 2),
            "pauses": len(pauses),
            "pause_mean_s": round(float(np.mean(pauses)), 2) if pauses else 0.0,
            "pause_std_s": round(float(np.std(pauses)), 2) if pauses else 0.0,
            "pause_max_s": round(float(np.max(pauses)), 2) if pauses else 0.0,
            "pause_total_s": round(float(np.sum(pauses)), 1),
            **_f0(y),
            **_spectrum(y),
            **_loudness(y),
        }
        if asr:
            hyp = transcripts.get(path.name, "")
            row["hyp"] = hyp
            row.update(_wer(hyp, TEXT))
        rows.append(row)

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0

    headers = ["file", "dur_s", "chars_per_s", "pauses", "pause_mean_s", "pause_std_s", "f0_med", "f0_std",
               "rolloff95", "energy_gt_8k_pct", "rms_dbfs", "clipped_samples"]
    if asr:
        headers += ["wer_pct", "cer_pct"]
    print("\t".join(headers))
    for row in rows:
        print("\t".join(str(row.get(key, "")) for key in headers))
    if asr:
        print()
        for row in rows:
            print(f"--- {row['file']}\n{row.get('hyp', '')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
