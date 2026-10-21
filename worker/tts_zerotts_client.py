"""Client ZeroTTS: model sống trong process engine dùng chung (xem engine_client.py).

Process engine nạp model một lần và dùng lại giữa các job TTS, lần nghe thử và
crawl. close_zerotts() chỉ ngắt các kết nối đang chờ, không tắt engine.
"""

from __future__ import annotations

from pathlib import Path

from engine_client import EngineClient, engine_python, shutdown_engine

_client = EngineClient("zerotts")


def zerotts_python() -> Path:
    return engine_python("zerotts")


def synthesize_zerotts(text: str, output_path: Path, voice: str) -> None:
    _client.synthesize(text, output_path, voice)


def list_zerotts_voices() -> list:
    return _client.list_voices()


def close_zerotts() -> None:
    """Ngắt kết nối đang chờ (dừng job); engine vẫn ấm cho lần chạy sau."""
    _client.close()


def shutdown_zerotts() -> None:
    """Tắt hẳn process engine, giải phóng RAM/VRAM."""
    shutdown_engine("zerotts")
