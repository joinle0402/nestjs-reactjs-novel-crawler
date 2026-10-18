"""Giao diện chung cho các nguồn truyện (source adapter).

Nguồn HTTP (ví dụ wikicv) cài đặt ``NovelSource`` và không cần trình duyệt.
sangtacviet vẫn dùng đường Playwright riêng trong ``crawler.py`` nên không có
adapter ở đây.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable


@dataclass
class ChapterInfo:
    site_id: str
    title: str
    url: str


@dataclass
class NovelMetadata:
    url: str
    title: str
    author: str
    summary: str
    cover: str


class SourceError(RuntimeError):
    """Lỗi khi đọc dữ liệu từ trang nguồn (HTTP, parse, chương khoá...)."""


class UnsupportedSourceError(ValueError):
    """URL không thuộc nguồn nào được hỗ trợ."""


@runtime_checkable
class NovelSource(Protocol):
    """Một nguồn truyện đọc bằng HTTP.

    ``site_id`` là khoá chương ổn định, lưu trong DB (``chapter_site_id``);
    ``chapter_url`` dựng lại URL chương từ ``site_id`` khi resume từ DB.
    """

    name: str

    def fetch_metadata(self) -> NovelMetadata:
        ...

    def fetch_chapter_list(self) -> tuple[list[ChapterInfo], int]:
        ...

    def chapter_url(self, site_id: str) -> str:
        ...

    def fetch_chapter_content(self, chapter: ChapterInfo) -> str:
        ...

    def close(self) -> None:
        ...
