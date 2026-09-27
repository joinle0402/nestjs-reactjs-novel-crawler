"""Tiện ích log dùng chung cho các process worker."""

from __future__ import annotations

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
