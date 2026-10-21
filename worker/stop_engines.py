"""Dừng các process engine TTS (VieNeu / ZeroTTS) đang giữ model trong RAM/VRAM.

Mặc định engine không tự tắt (engineIdleMinutes = 0). Chạy script này khi muốn
giải phóng bộ nhớ mà không cần tắt máy:

    python worker/stop_engines.py
"""

from __future__ import annotations

import sys
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from engine_client import ENGINE_NAMES, engine_label, shutdown_engine  # noqa: E402
from log_utils import log_message  # noqa: E402


def main() -> None:
    for engine in ENGINE_NAMES:
        if shutdown_engine(engine):
            log_message(f"đã dừng engine {engine_label(engine)}")
        else:
            log_message(f"engine {engine_label(engine)} không chạy")


if __name__ == "__main__":
    main()
