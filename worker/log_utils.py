"""Tiện ích log dùng chung cho các process worker."""

from __future__ import annotations

import sys
from datetime import datetime
from typing import TextIO


def format_elapsed(seconds: float) -> str:
    """Định dạng thời gian ngắn, không chèn khoảng trắng trước đơn vị."""
    if seconds < 1:
        return f"{seconds * 1000:.0f}ms"
    return f"{seconds:.2f}s"


def format_duration(seconds: float) -> str:
    """Đổi tổng số giây thành dạng dễ đọc: 1h15m34s hoặc 5m31s."""
    total_seconds = max(0, int(seconds))
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds_part = divmod(remainder, 60)
    if hours:
        return f"{hours}h{minutes}m{seconds_part}s"
    if minutes:
        return f"{minutes}m{seconds_part}s"
    return f"{seconds_part}s"


def log_message(
    message: object = "",
    *,
    file: TextIO | None = None,
    flush: bool = True,
) -> None:
    """In log kèm thời gian local theo định dạng ngày/tháng/năm."""
    timestamp = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    print(f"[{timestamp}] {message}", file=file, flush=flush)


class _TimestampedStream:
    """Thêm [dd/MM/yyyy HH:mm:ss] vào mỗi dòng print, để terminal và file log giống nhau."""

    def __init__(self, stream: TextIO):
        self._stream = stream
        self._buf = ""
        self.timestamped = True

    def write(self, data: str) -> int:
        if not data:
            return 0
        self._buf += data
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            if line.endswith("\r"):
                line = line[:-1]
            stamp = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
            self._stream.write(f"[{stamp}] {line}\n")
        return len(data)

    def flush(self) -> None:
        if self._buf:
            line = self._buf[:-1] if self._buf.endswith("\r") else self._buf
            stamp = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
            self._stream.write(f"[{stamp}] {line}")
            self._buf = ""
        self._stream.flush()

    def __getattr__(self, name: str):
        return getattr(self._stream, name)


def install_line_timestamps() -> None:
    """Bọc stdout/stderr một lần. Dùng cho crawler; TTS đã tự gắn giờ qua log_message."""
    if not getattr(sys.stdout, "timestamped", False):
        sys.stdout = _TimestampedStream(sys.stdout)  # type: ignore[assignment]
    if not getattr(sys.stderr, "timestamped", False):
        sys.stderr = _TimestampedStream(sys.stderr)  # type: ignore[assignment]
