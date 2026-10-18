"""Cào ảnh bìa cho truyện đã có trong DB và lưu vào novels.cover_image.

Mặc định chỉ liệt kê truyện còn thiếu ảnh (dry run):

  python scripts/sync_novel_covers.py

Cào và lưu ảnh cho các truyện thiếu:

  python scripts/sync_novel_covers.py --apply

Quét lại cả truyện đã có ảnh nguồn (giữ nguyên ảnh người dùng upload):

  python scripts/sync_novel_covers.py --apply --force

Chỉ một truyện, có giao diện để giải captcha:

  python scripts/sync_novel_covers.py --apply --novel-id 42 --headful
"""

from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from playwright.sync_api import sync_playwright  # noqa: E402

from browser_stealth import (  # noqa: E402
    apply_stealth,
    build_stealth_context_kwargs,
    build_stealth_launch_kwargs,
)
from config import (  # noqa: E402
    BROWSER_CHANNEL,
    BROWSER_LOCALE,
    BROWSER_STATE_PATH,
    BROWSER_STEALTH,
    BROWSER_TIMEOUT_MS,
    BROWSER_TIMEZONE,
)
from crawler import _book_cover_url, _normalize_novel_url, _select_vietnamese  # noqa: E402
from db import get_db, init_db  # noqa: E402


@dataclass(frozen=True)
class Target:
    id: int
    url: str
    title: str
    cover: str | None


def _is_remote_cover(value: str | None) -> bool:
    return bool(value) and value.strip().lower().startswith(("http://", "https://"))


def _load_targets(force: bool, novel_id: int | None, limit: int | None) -> list[Target]:
    sql = "SELECT id, url, title, cover_image FROM novels"
    conditions: list[str] = []
    params: list[object] = []
    if novel_id is not None:
        conditions.append("id = ?")
        params.append(novel_id)
    if not force:
        conditions.append("(cover_image IS NULL OR TRIM(cover_image) = '')")
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY id"
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)

    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [
        Target(
            id=int(row["id"]),
            url=str(row["url"]),
            title=str(row["title"] or ""),
            cover=row["cover_image"] or None,
        )
        for row in rows
    ]


def _save_cover(novel_id: int, cover: str) -> None:
    with get_db() as conn:
        conn.execute("UPDATE novels SET cover_image = ? WHERE id = ?", (cover, novel_id))


def _crawl_covers(targets: list[Target], delay: float, headful: bool) -> tuple[int, int, int]:
    state_path = Path(BROWSER_STATE_PATH)
    context_kwargs: dict = {}
    if state_path.is_file():
        context_kwargs["storage_state"] = str(state_path)

    saved = 0
    missing = 0
    failed = 0
    headless = not headful

    with sync_playwright() as playwright:
        launch_args = build_stealth_launch_kwargs({"headless": headless}, channel=BROWSER_CHANNEL)
        browser = playwright.chromium.launch(**launch_args)
        try:
            context = browser.new_context(
                **build_stealth_context_kwargs(
                    dict(context_kwargs),
                    locale=BROWSER_LOCALE,
                    timezone=BROWSER_TIMEZONE,
                )
            )
            page = context.new_page()
            apply_stealth(
                context,
                page,
                enabled=BROWSER_STEALTH,
                locale=BROWSER_LOCALE,
                headless=headless,
                channel=BROWSER_CHANNEL,
            )
            page.set_default_timeout(BROWSER_TIMEOUT_MS)

            for index, target in enumerate(targets, start=1):
                print(f"[{index}/{len(targets)}] #{target.id} {target.title or target.url}")
                try:
                    page.goto(_normalize_novel_url(target.url), wait_until="domcontentloaded")
                    page.wait_for_timeout(1500)
                    _select_vietnamese(page)
                    cover = _book_cover_url(page)
                    if not cover:
                        print("  không tìm thấy ảnh bìa")
                        missing += 1
                    else:
                        _save_cover(target.id, cover)
                        print(f"  đã lưu: {cover}")
                        saved += 1
                except Exception as exc:  # noqa: BLE001 - lỗi một truyện không dừng cả lượt
                    print(f"  lỗi: {exc}")
                    failed += 1
                if delay > 0 and index < len(targets):
                    time.sleep(delay)
        finally:
            browser.close()

    return saved, missing, failed


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="Cào ảnh bìa truyện vào novels.cover_image.")
    parser.add_argument("--apply", action="store_true", help="Thực sự cào và lưu (mặc định chỉ liệt kê).")
    parser.add_argument("--force", action="store_true", help="Quét lại cả truyện đã có ảnh nguồn; bỏ qua ảnh upload.")
    parser.add_argument("--novel-id", type=int, default=None, help="Chỉ xử lý một truyện.")
    parser.add_argument("--limit", type=int, default=None, help="Giới hạn số truyện mỗi lượt.")
    parser.add_argument("--delay", type=float, default=1.5, help="Giây nghỉ giữa hai truyện (mặc định 1.5).")
    parser.add_argument("--headful", action="store_true", help="Mở trình duyệt để giải captcha thủ công.")
    args = parser.parse_args()

    init_db()
    targets = _load_targets(args.force, args.novel_id, args.limit)
    if args.force:
        kept = [target for target in targets if target.cover and not _is_remote_cover(target.cover)]
        targets = [target for target in targets if not (target.cover and not _is_remote_cover(target.cover))]
        for target in kept:
            print(f"Bỏ qua #{target.id} {target.title}: giữ ảnh upload ({target.cover}).")

    if not targets:
        print("Không có truyện nào cần cào ảnh bìa.")
        return

    if not args.apply:
        print(f"Sẽ cào ảnh bìa cho {len(targets)} truyện (chạy lại với --apply để lưu):")
        for target in targets:
            current = target.cover or "(chưa có)"
            print(f"  #{target.id} {target.title or target.url} — {current}")
        return

    print(f"Bắt đầu cào ảnh bìa cho {len(targets)} truyện...")
    saved, missing, failed = _crawl_covers(targets, max(0.0, args.delay), args.headful)
    print(f"Xong: lưu {saved}, không thấy ảnh {missing}, lỗi {failed}.")


if __name__ == "__main__":
    main()
