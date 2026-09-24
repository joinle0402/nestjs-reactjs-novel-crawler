"""Đọc/ghi crawl_jobs cho worker web. Không dùng JobManager của console."""

from __future__ import annotations

import json
from typing import Any

import pymysql

from db import get_db

ACTIVE_STATUSES = ("pending", "running", "paused", "waiting_for_manual_action")
OPEN_STATUSES = ("running", "paused", "waiting_for_manual_action")


def _parse_numbers(value: Any) -> list[int] | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text or text == "null":
            return None
        value = json.loads(text)
    if not isinstance(value, list):
        return None
    numbers: list[int] = []
    for item in value:
        number = int(item)
        if number > 0:
            numbers.append(number)
    return numbers


def _row_to_job(row: dict[str, Any]) -> dict[str, Any]:
    novel_id = row.get("novel_id")
    return {
        "id": int(row["id"]),
        "novel_id": int(novel_id) if novel_id is not None else None,
        "url": row["url"],
        "scope": row["scope"],
        "chapter_range": row.get("chapter_range"),
        "chapter_numbers": _parse_numbers(row.get("chapter_numbers")),
        "status": row["status"],
        "total_chapters": row.get("total_chapters"),
        "current_chapter": row.get("current_chapter"),
        "error_message": row.get("error_message"),
    }


def _missing_table(exc: BaseException) -> bool:
    return isinstance(exc, pymysql.err.ProgrammingError) and bool(exc.args) and exc.args[0] == 1146


def fetch_job(job_id: int) -> dict[str, Any] | None:
    try:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM crawl_jobs WHERE id=?", (job_id,)).fetchone()
    except pymysql.err.ProgrammingError as exc:
        if _missing_table(exc):
            return None
        raise
    if not row:
        return None
    return _row_to_job(row)


def fetch_active_job() -> dict[str, Any] | None:
    try:
        with get_db() as conn:
            row = conn.execute(
                """
                SELECT * FROM crawl_jobs
                WHERE status IN ('pending', 'running', 'paused', 'waiting_for_manual_action')
                ORDER BY FIELD(status, 'running', 'waiting_for_manual_action', 'paused', 'pending'), id
                LIMIT 1
                """
            ).fetchone()
    except pymysql.err.ProgrammingError as exc:
        if _missing_table(exc):
            return None
        raise
    if not row:
        return None
    return _row_to_job(row)


def claim_job(job_id: int) -> bool:
    with get_db() as conn:
        conn.execute(
            """
            UPDATE crawl_jobs
            SET status='running',
                started_at=COALESCE(started_at, NOW()),
                error_message=NULL,
                updated_at=NOW()
            WHERE id=? AND status IN ('pending', 'running')
            """,
            (job_id,),
        )
        row = conn.execute("SELECT status FROM crawl_jobs WHERE id=?", (job_id,)).fetchone()
    return bool(row and row["status"] == "running")


def attach_novel(job_id: int, novel_id: int) -> None:
    with get_db() as conn:
        conn.execute(
            """
            UPDATE crawl_jobs
            SET novel_id=?, updated_at=NOW()
            WHERE id=? AND status='running'
            """,
            (novel_id, job_id),
        )


def enter_waiting(job_id: int, message: str) -> bool:
    text = (message or "Cần thao tác trên trình duyệt")[:4000]
    with get_db() as conn:
        conn.execute(
            """
            UPDATE crawl_jobs
            SET status='waiting_for_manual_action', error_message=?, updated_at=NOW()
            WHERE id=? AND status='running'
            """,
            (text, job_id),
        )
        row = conn.execute("SELECT status FROM crawl_jobs WHERE id=?", (job_id,)).fetchone()
    return bool(row and row["status"] == "waiting_for_manual_action")


def mark_if_open(job_id: int, status: str, error_message: str | None = None) -> bool:
    message = (error_message or None)
    if message:
        message = message[:4000]
    with get_db() as conn:
        conn.execute(
            """
            UPDATE crawl_jobs
            SET status=?, finished_at=NOW(), error_message=?, current_chapter=NULL, updated_at=NOW()
            WHERE id=? AND status IN ('running', 'paused', 'waiting_for_manual_action')
            """,
            (status, message, job_id),
        )
        row = conn.execute("SELECT status FROM crawl_jobs WHERE id=?", (job_id,)).fetchone()
    return bool(row and row["status"] == status)


def replace_plan(job_id: int, rows: list[dict[str, Any]]) -> None:
    with get_db() as conn:
        conn.execute("DELETE FROM crawl_job_chapters WHERE job_id=?", (job_id,))
        for row in rows:
            conn.execute(
                """
                INSERT INTO crawl_job_chapters
                    (job_id, chapter_id, chapter_number, chapter_site_id, title, status,
                     attempt_count, error_message, started_at, finished_at, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 'pending', 0, NULL, NULL, NULL, NOW(), NOW())
                """,
                (
                    job_id,
                    row.get("chapter_id"),
                    int(row["chapter_number"]),
                    row.get("chapter_site_id"),
                    row.get("title"),
                ),
            )
        conn.execute(
            """
            UPDATE crawl_jobs
            SET total_chapters=?, updated_at=NOW()
            WHERE id=? AND status='running'
            """,
            (len(rows), job_id),
        )


def set_chapter(job_id: int, chapter_number: int, status: str, chapter_id: int | None, error: str | None) -> None:
    message = (error or None)
    if message:
        message = message[:4000]
    finished = status in ("completed", "failed", "skipped")
    with get_db() as conn:
        conn.execute(
            """
            UPDATE crawl_job_chapters
            SET status=?,
                chapter_id=COALESCE(?, chapter_id),
                attempt_count=attempt_count + CASE WHEN ?='running' THEN 1 ELSE 0 END,
                error_message=?,
                started_at=CASE WHEN ?='running' THEN COALESCE(started_at, NOW()) ELSE started_at END,
                finished_at=CASE WHEN ? THEN NOW() ELSE finished_at END,
                updated_at=NOW()
            WHERE job_id=? AND chapter_number=?
            """,
            (status, chapter_id, status, message, status, finished, job_id, chapter_number),
        )
        if status == "running":
            conn.execute(
                """
                UPDATE crawl_jobs
                SET current_chapter=?, updated_at=NOW()
                WHERE id=? AND status='running'
                """,
                (chapter_number, job_id),
            )
            if chapter_id:
                conn.execute(
                    "UPDATE chapters SET crawl_status='processing' WHERE id=? AND crawl_status<>'completed'",
                    (chapter_id,),
                )


def reset_running_chapters(novel_id: int | None, job_id: int) -> None:
    with get_db() as conn:
        conn.execute(
            """
            UPDATE crawl_job_chapters
            SET status='pending', finished_at=NULL, updated_at=NOW()
            WHERE job_id=? AND status='running'
            """,
            (job_id,),
        )
        if novel_id:
            conn.execute(
                """
                UPDATE chapters
                SET crawl_status='pending'
                WHERE novel_id=? AND crawl_status='processing'
                """,
                (novel_id,),
            )


def count_chapter_statuses(job_id: int) -> dict[str, int]:
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT status, COUNT(*) AS n
            FROM crawl_job_chapters
            WHERE job_id=?
            GROUP BY status
            """,
            (job_id,),
        ).fetchall()
    return {str(row["status"]): int(row["n"]) for row in rows}
