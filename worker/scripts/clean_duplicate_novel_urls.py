"""Clean empty/duplicate novels.url so TypeORM can add UNIQUE INDEX.

Empty URL with chapters: restore from SQLite by title, else missing://novel/{id}.
Empty URL with 0 chapters: delete.
Duplicate non-empty URLs: keep the row with most chapters.

  python scripts/clean_duplicate_novel_urls.py
  python scripts/clean_duplicate_novel_urls.py --apply
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from config import SQLITE_PATH  # noqa: E402
from db import get_db  # noqa: E402


def _table_exists(conn, name: str) -> bool:
    row = conn.execute(
        """
        SELECT COUNT(*) AS n
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = %s
        """,
        (name,),
    ).fetchone()
    return bool(row and int(row["n"]) > 0)


def _chapter_table(conn) -> str | None:
    if _table_exists(conn, "chapters"):
        return "chapters"
    if _table_exists(conn, "chapter"):
        return "chapter"
    return None


def _sqlite_urls_by_title() -> dict:
    path = Path(SQLITE_PATH)
    if not path.is_file():
        return {}
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    try:
        exists = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='novels'"
        ).fetchone()
        if not exists:
            return {}
        rows = conn.execute(
            "SELECT title, url FROM novels WHERE url IS NOT NULL AND trim(url) <> ''"
        ).fetchall()
        mapping = {}
        for row in rows:
            mapping[str(row["title"]).strip()] = row["url"]
        return mapping
    finally:
        conn.close()


def _delete_novels(conn, novel_ids: list, chapter_table: str | None) -> None:
    if not novel_ids:
        return
    placeholders = ",".join(["%s"] * len(novel_ids))
    if _table_exists(conn, "playback_state"):
        conn.execute(
            "DELETE FROM playback_state WHERE novel_id IN ({0})".format(placeholders),
            novel_ids,
        )
    if chapter_table:
        conn.execute(
            "DELETE FROM `{0}` WHERE novel_id IN ({1})".format(chapter_table, placeholders),
            novel_ids,
        )
    conn.execute(
        "DELETE FROM novels WHERE id IN ({0})".format(placeholders),
        novel_ids,
    )


def plan(conn):
    chapter_table = _chapter_table(conn)
    count_sql = (
        "(SELECT COUNT(*) FROM `{0}` c WHERE c.novel_id = n.id)".format(chapter_table)
        if chapter_table
        else "0"
    )
    empty = conn.execute(
        """
        SELECT n.id, n.url, n.title, {0} AS chapter_count
        FROM novels n
        WHERE n.url IS NULL OR TRIM(n.url) = ''
        ORDER BY n.id
        """.format(count_sql)
    ).fetchall()

    sqlite_urls = _sqlite_urls_by_title()
    taken_urls = set()
    existing = conn.execute(
        "SELECT url FROM novels WHERE url IS NOT NULL AND TRIM(url) <> ''"
    ).fetchall()
    for row in existing:
        taken_urls.add(row["url"])

    restore = []
    placeholders = []
    to_delete = []
    for row in empty:
        title = str(row["title"] or "").strip()
        chapters = int(row["chapter_count"] or 0)
        sqlite_url = sqlite_urls.get(title)
        if sqlite_url and sqlite_url not in taken_urls:
            restore.append({"id": int(row["id"]), "url": sqlite_url, "title": title, "chapters": chapters})
            taken_urls.add(sqlite_url)
        elif chapters > 0:
            url = "missing://novel/{0}".format(row["id"])
            placeholders.append(
                {"id": int(row["id"]), "url": url, "title": title, "chapters": chapters}
            )
            taken_urls.add(url)
        else:
            url = "missing://novel/{0}".format(row["id"])
            placeholders.append(
                {"id": int(row["id"]), "url": url, "title": title, "chapters": chapters}
            )
            taken_urls.add(url)

    dup_urls = conn.execute(
        """
        SELECT url, COUNT(*) AS c
        FROM novels
        WHERE url IS NOT NULL AND TRIM(url) <> ''
        GROUP BY url
        HAVING c > 1
        ORDER BY c DESC
        """
    ).fetchall()

    keep = []
    for group in dup_urls:
        url = group["url"]
        if chapter_table:
            rows = conn.execute(
                """
                SELECT n.id, n.title, {0} AS chapter_count
                FROM novels n
                WHERE n.url = %s
                ORDER BY chapter_count DESC, n.id ASC
                """.format(count_sql),
                (url,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, title, 0 AS chapter_count FROM novels WHERE url = %s ORDER BY id",
                (url,),
            ).fetchall()
        keep.append(rows[0])
        to_delete.extend(int(row["id"]) for row in rows[1:])

    return {
        "chapter_table": chapter_table,
        "empty": empty,
        "restore": restore,
        "placeholders": placeholders,
        "keep": keep,
        "dup_urls": dup_urls,
        "to_delete": sorted(set(to_delete)),
        "sqlite_hits": len(sqlite_urls),
    }


def clean_chapter_keys(conn, chapter_table, apply):
    if not chapter_table:
        print("chapters: skip (no table)")
        return

    empty = conn.execute(
        """
        SELECT id, novel_id, chapter_site_id
        FROM `{0}`
        WHERE chapter_site_id IS NULL OR TRIM(chapter_site_id) = ''
        """.format(chapter_table)
    ).fetchall()
    print("empty chapter_site_id: {0}".format(len(empty)))

    orphans = conn.execute(
        """
        SELECT c.id, c.novel_id
        FROM `{0}` c
        LEFT JOIN novels n ON n.id = c.novel_id
        WHERE n.id IS NULL
        """.format(chapter_table)
    ).fetchall()
    print("orphan chapters (no novel): {0}".format(len(orphans)))

    if apply:
        for row in empty:
            conn.execute(
                "UPDATE `{0}` SET chapter_site_id=%s WHERE id=%s".format(chapter_table),
                ("missing-{0}".format(row["id"]), row["id"]),
            )
        if orphans:
            orphan_ids = [int(row["id"]) for row in orphans]
            placeholders = ",".join(["%s"] * len(orphan_ids))
            conn.execute(
                "DELETE FROM `{0}` WHERE id IN ({1})".format(chapter_table, placeholders),
                orphan_ids,
            )
        if _table_exists(conn, "playback_state"):
            conn.execute(
                """
                DELETE p FROM playback_state p
                LEFT JOIN novels n ON n.id = p.novel_id
                WHERE n.id IS NULL
                """
            )

    dups = conn.execute(
        """
        SELECT novel_id, chapter_site_id, COUNT(*) AS c
        FROM `{0}`
        GROUP BY novel_id, chapter_site_id
        HAVING c > 1
        """.format(chapter_table)
    ).fetchall()
    print("duplicate (novel_id, chapter_site_id): {0}".format(len(dups)))

    delete_ids = []
    for group in dups:
        rows = conn.execute(
            """
            SELECT id, CHAR_LENGTH(IFNULL(content, '')) AS content_len
            FROM `{0}`
            WHERE novel_id = %s AND chapter_site_id = %s
            ORDER BY content_len DESC, id ASC
            """.format(chapter_table),
            (group["novel_id"], group["chapter_site_id"]),
        ).fetchall()
        keep_id = int(rows[0]["id"])
        extras = [int(row["id"]) for row in rows[1:]]
        delete_ids.extend(extras)
        print(
            "  keep chapter id={0} drop {1} (novel_id={2} site={3!r})".format(
                keep_id, extras, group["novel_id"], group["chapter_site_id"]
            )
        )

    print("will delete {0} chapter(s)".format(len(delete_ids)))
    if apply and delete_ids:
        placeholders = ",".join(["%s"] * len(delete_ids))
        conn.execute(
            "DELETE FROM `{0}` WHERE id IN ({1})".format(chapter_table, placeholders),
            delete_ids,
        )

    if apply:
        leftover = conn.execute(
            """
            SELECT novel_id, chapter_site_id, COUNT(*) AS c
            FROM `{0}`
            GROUP BY novel_id, chapter_site_id
            HAVING c > 1
            """.format(chapter_table)
        ).fetchall()
        empty_left = conn.execute(
            """
            SELECT COUNT(*) AS n FROM `{0}`
            WHERE chapter_site_id IS NULL OR TRIM(chapter_site_id) = ''
            """.format(chapter_table)
        ).fetchone()
        print("chapters leftover dups: {0}".format(leftover or "none"))
        print(
            "chapters leftover empty site id: {0}".format(
                int(empty_left["n"]) if empty_left else 0
            )
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Clean duplicate/empty novels.url")
    parser.add_argument("--apply", action="store_true", help="Write MySQL changes")
    parser.add_argument(
        "--restore-from-sqlite",
        action="store_true",
        help="On --apply, copy real URLs from novels.db by title (optional)",
    )
    args = parser.parse_args()

    with get_db() as conn:
        result = plan(conn)
        print("chapter table: {0}".format(result["chapter_table"] or "(none)"))
        print("sqlite title->url map: {0}".format(result["sqlite_hits"]))
        print("empty/null url novels: {0}".format(len(result["empty"])))
        for row in result["empty"]:
            print(
                "  id={0} chapters={1} title={2!r}".format(
                    row["id"], row["chapter_count"], row["title"]
                )
            )

        print("sqlite URL matches (info): {0}".format(len(result["restore"])))
        for row in result["restore"]:
            print("  id={0} -> {1}".format(row["id"], row["url"]))

        print("placeholder urls: {0}".format(len(result["placeholders"])))
        for row in result["placeholders"]:
            print("  id={0} -> {1}".format(row["id"], row["url"]))

        print("duplicate non-empty urls: {0}".format(len(result["dup_urls"])))
        for row in result["keep"]:
            print(
                "  keep id={0} chapters={1} title={2!r}".format(
                    row["id"], row["chapter_count"], row["title"]
                )
            )

        print("will delete {0} novel(s): {1}".format(len(result["to_delete"]), result["to_delete"]))

        if not args.apply:
            clean_chapter_keys(conn, result["chapter_table"], apply=False)
            print("Dry-run. Re-run with --apply to write unique placeholder keys.")
            return

        if args.restore_from_sqlite:
            for row in result["restore"]:
                conn.execute("UPDATE novels SET url=%s WHERE id=%s", (row["url"], row["id"]))
            skip_ids = {row["id"] for row in result["restore"]}
        else:
            skip_ids = set()
            for row in result["restore"]:
                url = "missing://novel/{0}".format(row["id"])
                conn.execute("UPDATE novels SET url=%s WHERE id=%s", (url, row["id"]))

        for row in result["placeholders"]:
            if row["id"] in skip_ids:
                continue
            conn.execute("UPDATE novels SET url=%s WHERE id=%s", (row["url"], row["id"]))
        _delete_novels(conn, result["to_delete"], result["chapter_table"])

        leftover = conn.execute(
            """
            SELECT url, COUNT(*) AS c
            FROM novels
            GROUP BY url
            HAVING c > 1
            """
        ).fetchall()
        empty_left = conn.execute(
            """
            SELECT COUNT(*) AS n FROM novels
            WHERE url IS NULL OR TRIM(url) = ''
            """
        ).fetchone()
        print("Applied.")
        print("remaining duplicate urls: {0}".format(leftover or "none"))
        print("remaining empty urls: {0}".format(int(empty_left["n"]) if empty_left else 0))
        print("TypeORM can ADD UNIQUE INDEX on url.")
        clean_chapter_keys(conn, result["chapter_table"], apply=True)


if __name__ == "__main__":
    main()
