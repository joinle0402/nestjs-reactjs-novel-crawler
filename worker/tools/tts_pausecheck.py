"""So nhịp nghỉ giữa cách ghép cũ (đều) và mới (theo loại ranh giới).

    python worker/tools/tts_pausecheck.py worker/tmp/chapter_sample.txt

Ghi worker/output/tts-pause/new.mp3 và flat.mp3 rồi in thống kê khoảng nghỉ.
Chạy bằng python của worker (đúng môi trường pipeline).
"""

from __future__ import annotations

import asyncio
import re
import statistics
import subprocess
import sys
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent.parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

import tts  # noqa: E402
from config import load_tts_settings  # noqa: E402

OUT_DIR = WORKER_DIR / "output" / "tts-pause"


def _pauses(path: Path) -> list[float]:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
         "-af", "silencedetect=noise=-40dB:d=0.15", "-f", "null", "-"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return [float(value) for value in re.findall(r"silence_duration: ([\d.]+)", result.stderr or "")]


def _report(label: str, path: Path) -> None:
    pauses = _pauses(path)
    body = [p for p in pauses if 0.15 <= p <= 3.0]
    if not body:
        print(f"{label}: không thấy khoảng nghỉ")
        return
    print(
        f"{label}: {len(body)} khoảng | mean {statistics.mean(body):.2f}s"
        f" | std {statistics.pstdev(body):.2f}s | min {min(body):.2f}s | max {max(body):.2f}s"
        f" | tổng {sum(body):.1f}s",
        flush=True,
    )


def main() -> int:
    text_path = Path(sys.argv[1])
    text = text_path.read_text(encoding="utf-8")
    settings = load_tts_settings()
    voice = str(settings["voice"])

    prepared = tts._prepare_vieneu_speech(tts._normalize_tts_text(text))
    chunks, gaps = tts._split_vieneu_chunks_with_gaps(prepared)
    print(f"{len(chunks)} chunk | ranh giới: {gaps}", flush=True)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    new_path = OUT_DIR / "new.mp3"
    flat_path = OUT_DIR / "flat.mp3"

    async def render(gaps_arg, path):
        await tts._write_vieneu_chunks(
            chunks,
            path,
            asyncio.Semaphore(1),
            engine="vieneu",
            voice=voice,
            rate="+0%",
            gaps=gaps_arg,
        )

    asyncio.run(render(gaps, new_path))
    asyncio.run(render(None, flat_path))

    _report("mới (theo ngữ cảnh)", new_path)
    _report("cũ (đều 360ms)   ", flat_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
