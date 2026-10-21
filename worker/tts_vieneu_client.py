"""Client VieNeu: model sống trong process engine dùng chung (xem engine_client.py).

Process engine nạp model một lần và dùng lại giữa các job TTS, lần nghe thử và
crawl. close_vieneu() chỉ ngắt các kết nối đang chờ, không tắt engine.
"""

from __future__ import annotations

from pathlib import Path

from engine_client import EngineClient, engine_python, shutdown_engine

_client = EngineClient("vieneu")


def vieneu_python() -> Path:
    return engine_python("vieneu")


def synthesize_vieneu(text: str, output_path: Path, voice: str) -> None:
    _client.synthesize(text, output_path, voice)


def list_vieneu_voices() -> list:
    return _client.list_voices()


def close_vieneu() -> None:
    """Ngắt kết nối đang chờ (dừng job); engine vẫn ấm cho lần chạy sau."""
    _client.close()


def shutdown_vieneu() -> None:
    """Tắt hẳn process engine, giải phóng RAM/VRAM."""
    shutdown_engine("vieneu")
