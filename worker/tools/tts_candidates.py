"""Render các ứng viên giọng trên cùng một đoạn text để chấm khách quan.

Chạy bằng python của worker (3.8, có edge-tts; engine offline tự spawn venv riêng):

    python worker/tools/tts_candidates.py

Kết quả: worker/output/tts-eval/x1/<label>.mp3 và .../x1.5/<label>.mp3
(copy 1.5x bằng rubberband giữ cao độ).
"""

from __future__ import annotations

import asyncio
import shutil
import subprocess
import sys
import time
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent.parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

import edge_tts  # noqa: E402

from tts_vieneu_client import synthesize_vieneu  # noqa: E402
from tts_zerotts_client import synthesize_zerotts  # noqa: E402

OUT_DIR = WORKER_DIR / "output" / "tts-eval"
SPEED = 1.5

TEXT = (
    "Trời vừa tối, hắn đã có mặt ở đầu con hẻm. Ngõ nhỏ, ẩm ướt, hai bên là những "
    "bức tường loang lổ. Hắn dừng lại, nghe ngóng. Phía trong vọng ra tiếng nói: "
    "“Đi nhanh lên, sắp muộn rồi.” Hắn nhíu mày, tự hỏi: rốt cuộc chuyện này là sao? "
    "Ba ngày trước, mọi thứ vẫn còn bình thường."
)

# label -> (engine, voice, rate, ghi chú)
CANDIDATES = {
    "01_vieneu_clone_hoaimy": ("vieneu", "Hoài My (Clone)", "+0%", "đang dùng: clone từ edge-tts"),
    "02_vieneu_quynhanh": ("vieneu", "Quỳnh Anh", "+0%", "preset nữ Bắc đọc truyện"),
    "03_vieneu_kimthanh": ("vieneu", "Kim Thanh", "+0%", "preset nữ Nam đọc truyện"),
    "04_vieneu_ngoclinh": ("vieneu", "Ngọc Linh", "+0%", "preset nữ Bắc kể chuyện"),
    "05_vieneu_doantrang": ("vieneu", "Đoan Trang", "+0%", "preset nữ Bắc tự nhiên"),
    "06_vieneu_maianh": ("vieneu", "Mai Anh", "+0%", "preset nữ Bắc tin tức"),
    "07_edge_hoaimy_0": ("edge-tts", "vi-VN-HoaiMyNeural", "+0%", "cloud, sạch nhưng phẳng"),
    "08_edge_hoaimy_50": ("edge-tts", "vi-VN-HoaiMyNeural", "+50%", "cloud + rate 50%"),
    "09_zerotts_kimoanh": ("zerotts", "kimoanh", "+0%", "offline CPU, giọng ấm"),
    "10_zerotts_maichi": ("zerotts", "maichi", "+0%", "offline CPU, mặc định"),
}


def _speed_copy(src: Path, dest: Path, tempo: float) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            shutil.which("ffmpeg") or "ffmpeg",
            "-y", "-i", str(src),
            "-filter:a", f"rubberband=tempo={tempo}",
            "-b:a", "192k", str(dest),
        ],
        check=True,
        capture_output=True,
    )


async def _run_blocking(func, *args):
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, func, *args)


async def _render(label: str, engine: str, voice: str, rate: str) -> float:
    out = OUT_DIR / "x1" / f"{label}.mp3"
    out.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    if engine == "vieneu":
        await _run_blocking(synthesize_vieneu, TEXT, out, voice)
    elif engine == "zerotts":
        await _run_blocking(synthesize_zerotts, TEXT, out, voice)
    else:
        last = None
        for attempt in range(3):
            try:
                await edge_tts.Communicate(TEXT, voice, rate=rate).save(str(out))
                if out.is_file() and out.stat().st_size > 1000:
                    break
            except Exception as exc:  # noqa: BLE001
                last = exc
            await asyncio.sleep(2)
        else:
            raise RuntimeError(f"edge-tts không trả audio: {last}")
    return time.monotonic() - started


async def main() -> int:
    rows = []
    for label, (engine, voice, rate, note) in CANDIDATES.items():
        try:
            seconds = await _render(label, engine, voice, rate)
        except Exception as exc:
            print(f"{label}: LỖI {type(exc).__name__}: {exc}", flush=True)
            continue
        _speed_copy(OUT_DIR / "x1" / f"{label}.mp3", OUT_DIR / f"x{SPEED}" / f"{label}.mp3", SPEED)
        rows.append((label, engine, voice, note, round(seconds, 1)))
        print(f"{label}: xong ({seconds:.1f}s)", flush=True)

    lines = [f"Text: {TEXT}", ""]
    for label, engine, voice, note, seconds in rows:
        lines.append(f"{label}: {engine} / {voice} — {note} | render {seconds}s")
    (OUT_DIR / "index.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"\nxong: {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
