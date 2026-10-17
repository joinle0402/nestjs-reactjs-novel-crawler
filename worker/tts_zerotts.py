"""Process ZeroTTS (Python >= 3.9). stdout là giao thức JSON; log thư viện đi stderr.

Worker Python 3.8 không import được zerotts, nên giữ model trong process này
và nhận từng đoạn qua stdin. ZeroTTS chạy ONNX trên CPU, không cần torch.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_MODEL_ID = "zeroweight-ai/ZeroTTS"


def _configure_stdio() -> None:
    for name in ("stdin", "stdout", "stderr"):
        stream = getattr(sys, name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def _open_protocol():
    """Giữ fd stdout cho JSON. print() của thư viện chuyển sang stderr."""
    protocol_fd = os.dup(sys.stdout.fileno())
    protocol = os.fdopen(protocol_fd, "w", encoding="utf-8", errors="replace", buffering=1, closefd=True)
    sys.stdout = sys.stderr
    return protocol


def _emit(protocol, payload: dict) -> None:
    line = json.dumps(payload, ensure_ascii=False)
    try:
        protocol.write(line + "\n")
    except UnicodeEncodeError:
        # Fallback with ascii encoding if terminal codec has surrogate issues
        protocol.write(json.dumps(payload, ensure_ascii=True) + "\n")
    protocol.flush()


def _is_zerotts_cached() -> bool:
    hf_home = os.environ.get("HF_HOME") or os.environ.get("HUGGINGFACE_HUB_CACHE")
    if hf_home:
        cache_dir = Path(hf_home)
        if not (cache_dir / "models--zeroweight-ai--ZeroTTS").exists():
            cache_dir = cache_dir / "hub"
    else:
        cache_dir = Path.home() / ".cache" / "huggingface" / "hub"
    snapshots = cache_dir / "models--zeroweight-ai--ZeroTTS" / "snapshots"
    return snapshots.is_dir() and any(snapshots.iterdir())


def _load_engine():
    if "HF_HUB_OFFLINE" not in os.environ and _is_zerotts_cached():
        os.environ["HF_HUB_OFFLINE"] = "1"

    from zerotts import ZeroTTS

    model_id = os.environ.get("ZEROTTS_MODEL", "").strip() or DEFAULT_MODEL_ID
    print(f"tải model ZeroTTS ({model_id})", file=sys.stderr, flush=True)
    return ZeroTTS.from_pretrained(model_id)


def _wav_to_mp3(wav_path: Path, output_path: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ZeroTTS cần ffmpeg để xuất MP3. Cài: winget install Gyan.FFmpeg")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(wav_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "192k",
            str(output_path),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    if result.returncode != 0 or not output_path.is_file() or output_path.stat().st_size <= 0:
        tail = (result.stderr or result.stdout or "").strip()[-500:]
        raise RuntimeError(f"ffmpeg không xuất được MP3: {tail}")


def _synthesize(engine, request: dict) -> None:
    text = str(request.get("text") or "").strip()
    voice = str(request.get("voice") or "").strip()
    output = str(request.get("output") or "").strip()
    if not text:
        raise ValueError("Nội dung rỗng")
    if not voice:
        raise ValueError("Thiếu giọng ZeroTTS")
    if voice.startswith("vi-VN-"):
        raise ValueError(
            f"Giọng {voice} thuộc edge-tts. Chọn giọng ZeroTTS trong Cài đặt TTS."
        )
    if not output:
        raise ValueError("Thiếu đường dẫn MP3")

    output_path = Path(output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    wav_path = output_path.with_suffix(".zerotts.wav")
    try:
        audio = engine.synthesize(text, voice=voice)
        engine.save_audio(audio, str(wav_path))
        _wav_to_mp3(wav_path, output_path)
    finally:
        try:
            wav_path.unlink(missing_ok=True)
        except OSError:
            pass


def main() -> int:
    _configure_stdio()
    protocol = _open_protocol()
    try:
        engine = _load_engine()
    except Exception as exc:
        _emit(protocol, {"ready": False, "error": f"{type(exc).__name__}: {exc}"})
        return 1

    voices: list = []
    try:
        voices = list(engine.list_voices())
    except Exception as exc:
        print(f"không liệt kê được giọng: {exc}", file=sys.stderr, flush=True)
    _emit(protocol, {"ready": True, "voices": voices})

    for line in sys.stdin:
        raw = line.strip()
        if not raw:
            continue
        try:
            request = json.loads(raw)
            if not isinstance(request, dict):
                raise ValueError("Yêu cầu không phải object JSON")
            _synthesize(engine, request)
            _emit(protocol, {"ok": True})
        except Exception as exc:
            _emit(protocol, {"ok": False, "error": f"{type(exc).__name__}: {exc}"})
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
