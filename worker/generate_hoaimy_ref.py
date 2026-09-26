"""Tạo file audio tham chiếu Hoài My cho VieNeu clone."""

from __future__ import annotations

import asyncio
import subprocess
from pathlib import Path
import edge_tts

OUT_DIR = Path(__file__).resolve().parent / "ref_voices"
OUT_DIR.mkdir(parents=True, exist_ok=True)
MP3_PATH = OUT_DIR / "hoaimy.mp3"
WAV_PATH = OUT_DIR / "hoaimy.wav"

REF_TEXT = (
    "Cố Thanh Y đứng ở ban công nhìn xuống con đường phía dưới, "
    "ánh đèn vàng nhạt nhẹ nhàng trải dài trong màn đêm tĩnh lặng."
)


async def _generate():
    print("Đang tạo âm thanh mẫu từ edge-tts vi-VN-HoaiMyNeural...", flush=True)
    last_err = None
    for attempt in range(5):
        try:
            communicate = edge_tts.Communicate(REF_TEXT, "vi-VN-HoaiMyNeural", rate="+0%")
            await communicate.save(str(MP3_PATH))
            if MP3_PATH.is_file() and MP3_PATH.stat().st_size > 100:
                break
        except Exception as e:
            last_err = e
            print(f"Lần {attempt + 1} lỗi ({e}), thử lại...", flush=True)
            await asyncio.sleep(2)
    else:
        raise RuntimeError(f"Không thể tải âm thanh từ edge-tts sau 5 lần: {last_err}")

    print("Đang chuyển đổi sang WAV 48kHz mono...", flush=True)
    subprocess.run(
        ["ffmpeg", "-y", "-i", str(MP3_PATH), "-ar", "48000", "-ac", "1", str(WAV_PATH)],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if MP3_PATH.is_file():
        MP3_PATH.unlink()

    print(f"Thành công! File tạo tại: {WAV_PATH} (kích thước: {WAV_PATH.stat().st_size} bytes)", flush=True)


if __name__ == "__main__":
    asyncio.run(_generate())
