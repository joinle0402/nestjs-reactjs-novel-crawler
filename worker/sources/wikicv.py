"""Adapter đọc truyện từ wikicv.org bằng HTTP thường (requests + BeautifulSoup).

Không cần trình duyệt: nội dung chương đã có sẵn trong HTML server-rendered.
Danh sách chương lấy qua ``/book/index`` với chữ ký ``sign`` tính từ ``signKey``
trên trang truyện.
"""

from __future__ import annotations

import hashlib
import random
import re
import time
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup

from .base import ChapterInfo, NovelMetadata, SourceError

DEFAULT_BASE = "https://wikicv.org"
PAGE_SIZE = 501
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
_MAX_RETRIES = 3
_RETRY_BACKOFF_SEC = 2.0
_MAX_RETRY_BACKOFF_SEC = 20.0


def _retry_delay(response: requests.Response | None, attempt: int) -> float:
    """Backoff có jitter; ưu tiên Retry-After khi nguồn trả 429/503."""
    if response is not None:
        retry_after = (response.headers.get("Retry-After") or "").strip()
        if retry_after:
            try:
                return max(0.0, min(float(retry_after), 120.0))
            except ValueError:
                pass
    base = _RETRY_BACKOFF_SEC * (2**attempt)
    return min(_MAX_RETRY_BACKOFF_SEC, base * random.uniform(1.0, 1.5))


_RE_BOOK_ID = re.compile(r'var bookId\s*=\s*"([^"]+)"')
_RE_SIGN_KEY = re.compile(r'var signKey\s*=\s*"([^"]+)"')
_RE_SIGN_ROTATE = re.compile(
    r"function\s+fuzzySign\s*\(\s*text\s*\)\s*\{\s*return\s+text\.substring\((\d+)\)"
)
_DEFAULT_SIGN_ROTATE = 81


def rotate(text: str, size: int) -> str:
    """Bản Python của ``fuzzySign`` phía client (xoay chuỗi quanh vị trí ``size``)."""
    return text[size:] + text[:size]


def chapter_sign(sign_key: str, start: int, size: int, rotate_size: int = _DEFAULT_SIGN_ROTATE) -> str:
    payload = rotate(f"{sign_key}{start}{size}", rotate_size)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class WikicvSource:
    name = "wikicv"

    def __init__(self, url: str, *, timeout: float = 30.0) -> None:
        self.url = url
        parsed = urlparse(url)
        self._base = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else DEFAULT_BASE
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update(
            {
                "User-Agent": USER_AGENT,
                "Accept-Language": "vi,en;q=0.9",
            }
        )
        self._book_id: str | None = None
        self._sign_key: str | None = None
        self._sign_rotate = _DEFAULT_SIGN_ROTATE
        self._chapters: list[ChapterInfo] | None = None
        self._vip_count = 0

    # ------------------------------------------------------------------ HTTP

    def _get(self, url: str, *, ajax: bool = False, referer: str | None = None) -> str:
        headers: dict[str, str] = {}
        if ajax:
            headers["X-Requested-With"] = "XMLHttpRequest"
            headers["Accept"] = "text/html, */*; q=0.01"
        if referer:
            headers["Referer"] = referer
        last_error: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            response: requests.Response | None = None
            try:
                response = self._session.get(url, headers=headers, timeout=self._timeout)
            except requests.RequestException as exc:
                last_error = exc
            else:
                if response.status_code == 200:
                    if not response.encoding:
                        response.encoding = "utf-8"
                    return response.text
                last_error = SourceError(f"HTTP {response.status_code} khi tải {url}")
                if response.status_code not in (403, 429, 500, 502, 503, 504):
                    break
            if attempt < _MAX_RETRIES - 1:
                time.sleep(_retry_delay(response, attempt))
        raise SourceError(f"Không tải được {url}: {last_error}")

    # -------------------------------------------------------------- metadata

    def fetch_metadata(self) -> NovelMetadata:
        html = self._get(self.url)
        self._load_script_keys(html)
        soup = BeautifulSoup(html, "html.parser")

        title_el = soup.select_one(".cover-info h2") or soup.select_one(".book-info h2")
        author_el = soup.select_one(".cover-info a[href^='/tac-gia/']")
        summary_el = soup.select_one(".book-desc-detail")
        cover_el = soup.select_one(".cover-wrapper img")

        title = title_el.get_text(" ", strip=True) if title_el else ""
        author = author_el.get_text(" ", strip=True) if author_el else ""
        summary = ""
        if summary_el:
            summary = "\n".join(
                paragraph.get_text(" ", strip=True)
                for paragraph in summary_el.find_all("p")
                if paragraph.get_text(strip=True)
            ) or summary_el.get_text(" ", strip=True)

        cover = ""
        if cover_el and cover_el.get("src"):
            cover = urljoin(self._base + "/", cover_el["src"].strip())

        return NovelMetadata(
            url=self.url,
            title=title,
            author=author,
            summary=summary,
            cover=cover,
        )

    def _load_script_keys(self, html: str) -> None:
        if not self._book_id:
            match = _RE_BOOK_ID.search(html)
            if match:
                self._book_id = match.group(1)
        if not self._sign_key:
            match = _RE_SIGN_KEY.search(html)
            if match:
                self._sign_key = match.group(1)
            rotate_match = _RE_SIGN_ROTATE.search(html)
            if rotate_match:
                self._sign_rotate = int(rotate_match.group(1))

    # ---------------------------------------------------------- chapter list

    def fetch_chapter_list(self) -> tuple[list[ChapterInfo], int]:
        if self._chapters is not None:
            return self._chapters, self._vip_count
        if not self._book_id or not self._sign_key:
            self.fetch_metadata()

        chapters: list[ChapterInfo] = []
        seen: set[str] = set()
        pending_starts = [0]
        visited: set[int] = set()

        while pending_starts:
            start = pending_starts.pop(0)
            if start in visited:
                continue
            visited.add(start)
            html = self._fetch_index_page(start)
            soup = BeautifulSoup(html, "html.parser")
            for anchor in soup.select("a[href*='/chuong-']"):
                href = (anchor.get("href") or "").strip()
                if not href or href in seen:
                    continue
                title = anchor.get_text(" ", strip=True)
                if not title:
                    continue
                seen.add(href)
                chapters.append(ChapterInfo(site_id=href, title=title, url=self.chapter_url(href)))
            for anchor in soup.select("ul.pagination a[data-start]"):
                try:
                    next_start = int(anchor["data-start"])
                except (KeyError, TypeError, ValueError):
                    continue
                if next_start not in visited and next_start not in pending_starts:
                    pending_starts.append(next_start)

        if not chapters:
            raise SourceError("Trang nguồn trả danh sách chương rỗng.")

        self._chapters = chapters
        self._vip_count = 0
        return chapters, self._vip_count

    def _fetch_index_page(self, start: int) -> str:
        assert self._book_id and self._sign_key
        sign = chapter_sign(self._sign_key, start, PAGE_SIZE, self._sign_rotate)
        url = (
            f"{self._base}/book/index"
            f"?bookId={self._book_id}&start={start}&size={PAGE_SIZE}"
            f"&signKey={self._sign_key}&sign={sign}"
        )
        return self._get(url, ajax=True, referer=self.url)

    # --------------------------------------------------------------- content

    def chapter_url(self, site_id: str) -> str:
        return f"{self._base}/{site_id.lstrip('/')}"

    def fetch_chapter_content(self, chapter: ChapterInfo) -> str:
        html = self._get(chapter.url, referer=self.url)
        soup = BeautifulSoup(html, "html.parser")
        body = soup.select_one("#bookContentBody") or soup.select_one("#bookContent")
        if body is None:
            raise SourceError("Không tìm thấy nội dung chương trên trang nguồn.")
        for break_tag in body.find_all("br"):
            break_tag.replace_with("\n")
        paragraphs = body.find_all("p")
        if paragraphs:
            chunks = [paragraph.get_text() for paragraph in paragraphs]
        else:
            chunks = [body.get_text()]
        text = "\n".join(chunk.strip() for chunk in chunks if chunk and chunk.strip())
        if len(text) < 50:
            raise SourceError("Nội dung chương quá ngắn hoặc đang bị khoá.")
        return text

    def close(self) -> None:
        self._session.close()
