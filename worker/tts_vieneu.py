"""Process VieNeu (Python >= 3.10). stdout là giao thức JSON; log thư viện đi stderr.

Worker Python 3.8 không import được vieneu, nên giữ model trong process này
và nhận từng chương qua stdin.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


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


REF_VOICES_DIR = Path(__file__).resolve().parent / "ref_voices"


def _register_custom_voices(engine) -> None:
    if not REF_VOICES_DIR.is_dir():
        return

    # Giọng Hoài My được clone từ edge-tts
    hoaimy_ref = REF_VOICES_DIR / "hoaimy.wav"
    if not hoaimy_ref.is_file():
        hoaimy_ref = REF_VOICES_DIR / "hoaimy.mp3"

    if hoaimy_ref.is_file():
        try:
            engine.add_voice("Hoài My (Clone)", str(hoaimy_ref), denoise=False)
            print(f"đã nạp giọng clone: Hoài My (Clone) ({hoaimy_ref.name})", file=sys.stderr, flush=True)
        except Exception as exc:
            print(f"lỗi nạp giọng clone Hoài My: {exc}", file=sys.stderr, flush=True)

    # Nạp thêm bất kỳ file âm thanh mẫu nào khác trong ref_voices nếu có
    for ref_file in sorted(REF_VOICES_DIR.glob("*")):
        if ref_file.suffix.lower() not in (".wav", ".mp3"):
            continue
        stem = ref_file.stem
        if stem.lower() == "hoaimy":
            continue
        voice_name = f"{stem} (Clone)"
        try:
            engine.add_voice(voice_name, str(ref_file), denoise=True)
            print(f"đã nạp giọng clone: {voice_name} ({ref_file.name})", file=sys.stderr, flush=True)
        except Exception as exc:
            print(f"lỗi nạp giọng clone {voice_name}: {exc}", file=sys.stderr, flush=True)


def _load_engine():
    from vieneu import Vieneu

    backend = os.environ.get("VIENEU_BACKEND", "onnx").strip().lower()
    kwargs: dict = {"max_batch_size": 4}
    if backend and backend != "auto":
        kwargs["backend"] = backend
    print(f"tải model backend={backend or 'auto'}", file=sys.stderr, flush=True)
    engine = Vieneu(**kwargs)
    _register_custom_voices(engine)
    return engine


def _wav_to_mp3(wav_path: Path, output_path: Path) -> None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("VieNeu cần ffmpeg để xuất MP3. Cài: winget install Gyan.FFmpeg")
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
            "128k",
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
        raise ValueError("Thiếu giọng VieNeu")
    if voice.startswith("vi-VN-"):
        raise ValueError(
            f"Giọng {voice} thuộc edge-tts. Chọn giọng VieNeu (ví dụ Hải Đăng) trong Cài đặt TTS."
        )
    if not output:
        raise ValueError("Thiếu đường dẫn MP3")

    output_path = Path(output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    wav_path = output_path.with_suffix(".vieneu.wav")
    try:
        audio = engine.infer(text, voice=voice)
        engine.save(audio, str(wav_path))
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
        voices = list(engine.list_preset_voices())
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
