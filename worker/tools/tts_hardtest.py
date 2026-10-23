"""Bài test khó: số, tên Hán Việt, câu dài, thoại — đo WER ở 1x và 1.5x.

    worker/.venv-vieneu/Scripts/python.exe worker/tools/tts_hardtest.py

Cần PhoWhisper-small đã tải sẵn (xem tts_eval.py). Chạy bằng venv VieNeu.
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent.parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))
if str(WORKER_DIR / "tools") not in sys.path:
    sys.path.insert(0, str(WORKER_DIR / "tools"))

import config  # noqa: E402,F401
import numpy as np  # noqa: E402

from tts_eval import _f0, _load, _loudness, _pauses, _spectrum, _wer  # noqa: E402
from tts_vieneu_client import synthesize_vieneu  # noqa: E402
from tts_zerotts_client import synthesize_zerotts  # noqa: E402

OUT_DIR = WORKER_DIR / "output" / "tts-hard"
SPEED = 1.5

TEXT = (
    "Tháng 8 năm 2026, Cố Thanh Y rời Tần hoàng lăng lúc 5 giờ 30 phút sáng. "
    "Ngoài cổng, một toán lính Trường An đã đứng chờ sẵn từ lúc trời còn chưa sáng, "
    "trên tay mỗi người cầm một tấm bảng gỗ khắc tên và chức vụ. "
    "Nàng khẽ hỏi: “Các ngươi chờ ta bao lâu rồi?” Không ai trả lời. "
    "Con đường dài hơn 12,5 km nối hoàng lăng với TP.HCM chỉ có một trạm dừng chân duy nhất, "
    "nơi người ta bán nước chè, bánh mì và đủ thứ lặt vặt khác, kể cả những món đồ cổ "
    "không rõ nguồn gốc mà đám lái buôn vẫn thường mang theo mỗi dịp lễ hội lớn trong năm."
)


def _speed_copy(src: Path, dest: Path, tempo: float) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(src), "-filter:a", f"rubberband=tempo={tempo}", "-b:a", "192k", str(dest)],
        check=True,
        capture_output=True,
    )


def main() -> int:
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--text-file", help="file .txt chứa đoạn cần đọc (mặc định: TEXT trong script)")
    parser.add_argument("--voices", help="danh sách label, cách nhau dấu phẩy")
    parser.add_argument("--out", help="thư mục output (mặc định worker/output/tts-hard)")
    args = parser.parse_args()

    global TEXT, OUT_DIR
    if args.text_file:
        TEXT = Path(args.text_file).read_text(encoding="utf-8").strip()
    if args.out:
        OUT_DIR = WORKER_DIR / "output" / args.out

    import torch
    from transformers import pipeline

    engine_for = {
        "vieneu_clone": (synthesize_vieneu, "Hoài My (Clone)"),
        "vieneu_kimthanh": (synthesize_vieneu, "Kim Thanh"),
        "vieneu_quynhanh": (synthesize_vieneu, "Quỳnh Anh"),
        "zerotts_maichi": (synthesize_zerotts, "maichi"),
        "zerotts_kimoanh": (synthesize_zerotts, "kimoanh"),
    }

    device = 0 if torch.cuda.is_available() else -1
    asr = pipeline(
        "automatic-speech-recognition",
        model="vinai/PhoWhisper-small",
        device=device,
        chunk_length_s=30,
    )
    # ASR đã nằm trong RAM: trả env về mặc định để engine VieNeu dùng cache gốc,
    # không tải lại model vào cache tạm.
    import os

    os.environ.pop("HF_HOME", None)

    rows = []
    wanted = [v.strip() for v in args.voices.split(",")] if args.voices else None
    for label, (synth, voice) in engine_for.items():
        if wanted and label not in wanted:
            continue
        x1 = OUT_DIR / "x1" / f"{label}.mp3"
        x15 = OUT_DIR / f"x{SPEED}" / f"{label}.mp3"
        started = time.monotonic()
        try:
            synth(TEXT, x1, voice)
            _speed_copy(x1, x15, SPEED)
        except Exception as exc:  # noqa: BLE001
            print(f"{label}: LỖI {type(exc).__name__}: {exc}", flush=True)
            continue

        y = _load(x1)
        hyp1 = asr(str(x1), generate_kwargs={"language": "vi", "task": "transcribe"})["text"].strip()
        hyp15 = asr(str(x15), generate_kwargs={"language": "vi", "task": "transcribe"})["text"].strip()
        pauses = _pauses(y)
        row = {
            "voice": label,
            "dur_s": round(len(y) / 24000, 1),
            "chars_per_s": round(len(TEXT) / (len(y) / 24000), 1),
            "pauses": len(pauses),
            "pause_std_s": round(float(np.std(pauses)), 2) if pauses else 0,
            "f0_std": _f0(y).get("f0_std"),
            "rolloff95": _spectrum(y)["rolloff95"],
            "rms_dbfs": _loudness(y)["rms_dbfs"],
            "wer_x1": _wer(hyp1, TEXT)["wer_pct"],
            "cer_x1": _wer(hyp1, TEXT)["cer_pct"],
            "wer_x15": _wer(hyp15, TEXT)["wer_pct"],
            "cer_x15": _wer(hyp15, TEXT)["cer_pct"],
            "hyp_x1": hyp1,
            "hyp_x15": hyp15,
            "render_s": round(time.monotonic() - started, 1),
        }
        rows.append(row)
        print(f"{label}: WER x1={row['wer_x1']}% x{SPEED}={row['wer_x15']}% ({row['render_s']}s)", flush=True)

    keys = ["voice", "dur_s", "chars_per_s", "pauses", "pause_std_s", "f0_std", "rolloff95", "rms_dbfs",
            "wer_x1", "cer_x1", "wer_x15", "cer_x15"]
    print("\t".join(keys))
    for row in rows:
        print("\t".join(str(row[key]) for key in keys))
    print()
    for row in rows:
        print(f"--- {row['voice']} x1  : {row['hyp_x1']}")
        print(f"--- {row['voice']} x1.5: {row['hyp_x15']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
