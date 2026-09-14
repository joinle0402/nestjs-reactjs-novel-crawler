"""Copy novels.db (SQLite) sang MySQL — giữ id để --novel-id không lệch."""

from __future__ import annotations

import argparse
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import SQLITE_PATH  # noqa: E402
from db import get_db, init_db  # noqa: E402


def _parse_dt(value: object) -> datetime:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None)
    text = str(value or "").strip()
    if not text:
        return datetime.now(timezone.utc).replace(tzinfo=None)
    text = text.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
        return parsed.replace(tzinfo=None)
    except ValueError:
        return datetime.now(timezone.utc).replace(tzinfo=None)


def _sqlite_columns(conn: sqlite3.Connection, table: str) -> set:
    rows = conn.execute("PRAGMA table_info({0})".format(table)).fetchall()
    return {row["name"] for row in rows}


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return row is not None


def _reset_auto_increment(conn, table: str) -> None:
    row = conn.execute(
        "SELECT COALESCE(MAX(id), 0) AS max_id FROM {0}".format(table)
    ).fetchone()
    next_id = int(row["max_id"]) + 1
    conn.execute("ALTER TABLE {0} AUTO_INCREMENT = {1}".format(table, next_id))


def migrate(sqlite_path: Path) -> None:
    if not sqlite_path.is_file():
        raise SystemExit("Không thấy SQLite: {0}".format(sqlite_path))

    sqlite_conn = sqlite3.connect(str(sqlite_path))
    sqlite_conn.row_factory = sqlite3.Row

    init_db()

    with get_db() as mysql:
        mysql.execute("SET FOREIGN_KEY_CHECKS = 0")

        novel_cols = _sqlite_columns(sqlite_conn, "novels")
        novels = sqlite_conn.execute("SELECT * FROM novels").fetchall()
        for row in novels:
            mysql.execute(
                """
                INSERT INTO novels (id, url, title, author, summary, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    url = VALUES(url),
                    title = VALUES(title),
                    author = VALUES(author),
                    summary = VALUES(summary)
                """,
                (
                    row["id"],
                    row["url"],
                    row["title"],
                    row["author"] if "author" in novel_cols else "",
                    row["summary"] if "summary" in novel_cols else "",
                    _parse_dt(row["created_at"] if "created_at" in novel_cols else None),
                ),
            )
        print("novels: {0}".format(len(novels)))

        chapter_cols = _sqlite_columns(sqlite_conn, "chapters")
        chapters = sqlite_conn.execute("SELECT * FROM chapters").fetchall()
        for row in chapters:
            mysql.execute(
                """
                INSERT INTO chapters (
                    id, novel_id, chapter_site_id, chapter_number, title, content,
                    mp3_path, crawled_at, crawl_status, tts_status,
                    tts_chars_total, tts_chars_done
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    title = VALUES(title),
                    content = VALUES(content),
                    mp3_path = VALUES(mp3_path),
                    crawled_at = VALUES(crawled_at),
                    crawl_status = VALUES(crawl_status),
                    tts_status = VALUES(tts_status),
                    tts_chars_total = VALUES(tts_chars_total),
                    tts_chars_done = VALUES(tts_chars_done)
                """,
                (
                    row["id"],
                    row["novel_id"],
                    row["chapter_site_id"],
                    row["chapter_number"],
                    row["title"],
                    row["content"] if "content" in chapter_cols else "",
                    row["mp3_path"] if "mp3_path" in chapter_cols else None,
                    _parse_dt(row["crawled_at"] if "crawled_at" in chapter_cols else None),
                    row["crawl_status"] if "crawl_status" in chapter_cols else "pending",
                    row["tts_status"] if "tts_status" in chapter_cols else "pending",
                    int(row["tts_chars_total"] or 0) if "tts_chars_total" in chapter_cols else 0,
                    int(row["tts_chars_done"] or 0) if "tts_chars_done" in chapter_cols else 0,
                ),
            )
        print("chapters: {0}".format(len(chapters)))

        playback_count = 0
        if _table_exists(sqlite_conn, "playback_state"):
            playback_rows = sqlite_conn.execute("SELECT * FROM playback_state").fetchall()
            for row in playback_rows:
                mysql.execute(
                    """
                    INSERT INTO playback_state (novel_id, chapter_number, position_sec, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        chapter_number = VALUES(chapter_number),
                        position_sec = VALUES(position_sec),
                        updated_at = VALUES(updated_at)
                    """,
                    (
                        row["novel_id"],
                        row["chapter_number"],
                        float(row["position_sec"] or 0),
                        _parse_dt(row["updated_at"]),
                    ),
                )
            playback_count = len(playback_rows)
        print("playback_state: {0}".format(playback_count))

        _reset_auto_increment(mysql, "novels")
        _reset_auto_increment(mysql, "chapters")
        mysql.execute("SET FOREIGN_KEY_CHECKS = 1")

    sqlite_conn.close()
    print("Xong. Đã copy {0} → MySQL.".format(sqlite_path))


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate SQLite novels.db sang MySQL")
    parser.add_argument(
        "--sqlite",
        default=SQLITE_PATH,
        help="Đường dẫn novels.db (mặc định worker/novels.db)",
    )
    args = parser.parse_args()
    migrate(Path(args.sqlite))


if __name__ == "__main__":
    main()
