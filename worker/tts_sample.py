"""Tạo một MP3 ngắn để nghe thử giọng. Gọi từ API, không trộn nhạc nền.

--fill-cache ghi sẵn câu mẫu vào worker/output/tts-samples.
Tên file phải khớp ttsSampleCacheName() trong backend.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    _reconfigure = getattr(_stream, "reconfigure", None)
    if _reconfigure is not None:
        _reconfigure(encoding="utf-8", errors="replace")

from tts import synthesize_clip
from tts_vieneu_client import close_vieneu

# Đổi câu thì sửa cả TTS_SAVED_SAMPLE_TEXT trong tts-sample.service.ts.
CANONICAL_TEXT = "Xin chào. Đây là đoạn thử giọng đọc. Nếu bạn nghe rõ câu này, giọng đã chọn đang hoạt động."
CACHE_DIR = Path(__file__).resolve().parent / "output" / "tts-samples"
_INVALID_FILENAME = re.compile(r'[<>:"/\\|?*]')
_EDGE_RATES = ("+50%", "+0%")


def cache_filename(engine: str, voice: str, rate: str) -> str:
    voice_part = _INVALID_FILENAME.sub("_", voice)
    if engine == "vieneu":
        return f"vieneu__{voice_part}.mp3"
    rate_part = rate.replace("+", "plus").replace("-", "minus").replace("%", "")
    return f"edge-tts__{voice_part}__{rate_part}.mp3"


def _voice_ids(const_name: str) -> list[str]:
    entity = Path(__file__).resolve().parent.parent / "backend" / "src" / "tts" / "entities" / "tts-job.entity.ts"
    source = entity.read_text(encoding="utf-8")
    match = re.search(rf"export const {const_name}.*?=\s*\[(.*?)\];", source, re.S)
    if not match:
        raise RuntimeError(f"Không thấy {const_name} trong {entity}")
    return re.findall(r"id:\s*'([^']+)'", match.group(1))


def _ready(path: Path) -> bool:
    return path.is_file() and path.stat().st_size > 100


def _write_one(engine: str, voice: str, rate: str) -> None:
    path = CACHE_DIR / cache_filename(engine, voice, rate)
    if _ready(path):
        print(f"có sẵn {path.name}", flush=True)
        return
    tmp = path.with_name(f"{path.stem}.part.mp3")
    print(f"đang lưu {path.name}", flush=True)
    try:
        synthesize_clip(CANONICAL_TEXT, tmp, engine=engine, voice=voice, rate=rate)
        if not _ready(tmp):
            raise RuntimeError(f"File rỗng: {path.name}")
        tmp.replace(path)
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    print(f"đã lưu {path.name}", flush=True)


def fill_cache() -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        for voice in _voice_ids("EDGE_TTS_VOICES"):
            for rate in _EDGE_RATES:
                _write_one("edge-tts", voice, rate)
        for voice in _voice_ids("VIENEU_VOICES"):
            _write_one("vieneu", voice, "+0%")
    finally:
        close_vieneu()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fill-cache", action="store_true")
    parser.add_argument("--engine")
    parser.add_argument("--voice")
    parser.add_argument("--rate")
    parser.add_argument("--text")
    parser.add_argument("--output")
    args = parser.parse_args()
    if args.fill_cache:
        fill_cache()
        return
    if not all([args.engine, args.voice, args.rate, args.text, args.output]):
        raise SystemExit("Thiếu --engine --voice --rate --text --output")
    output = Path(args.output)
    try:
        synthesize_clip(args.text, output, engine=args.engine, voice=args.voice, rate=args.rate)
    finally:
        close_vieneu()
    if not output.is_file() or output.stat().st_size == 0:
        raise SystemExit("Không tạo được file âm thanh")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1) from exc
