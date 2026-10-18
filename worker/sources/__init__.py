"""Đăng ký nguồn truyện (source adapter).

``create_source`` trả về adapter cho nguồn HTTP, hoặc ``None`` cho sangtacviet
(đường Playwright trong ``crawler.py``).
"""

from __future__ import annotations

import re

from .base import ChapterInfo, NovelMetadata, NovelSource, SourceError, UnsupportedSourceError

_WIKICV_HOST = re.compile(r"wikicv\.(?:org|net)", re.IGNORECASE)


def is_wikicv(url: str) -> bool:
    return bool(_WIKICV_HOST.search(url or ""))


def detect_source(url: str) -> str:
    """Trả về tên nguồn từ URL: ``wikicv`` hoặc ``sangtacviet``."""
    if is_wikicv(url):
        return "wikicv"
    return "sangtacviet"


def create_source(url: str) -> NovelSource | None:
    """Tạo adapter cho nguồn HTTP. ``None`` = dùng đường Playwright mặc định."""
    if is_wikicv(url):
        from .wikicv import WikicvSource

        return WikicvSource(url)
    return None


__all__ = [
    "ChapterInfo",
    "NovelMetadata",
    "NovelSource",
    "SourceError",
    "UnsupportedSourceError",
    "create_source",
    "detect_source",
    "is_wikicv",
]
