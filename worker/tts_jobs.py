"""Đọc/ghi bảng tts_jobs cho worker web. Không dùng JobManager của console."""

from __future__ import annotations

import json
from typing import Any

import pymysql

from db import get_db

ACTIVE_STATUSES = ("pending", "running")


def _parse_numbers(value: Any) -> list[int] | None:
    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        if not text:
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
    return {
        "id": int(row["id"]),
        "novel_id": int(row["novel_id"]),
        "scope": row["scope"],
        "chapter_range": row.get("chapter_range"),
        "chapter_numbers": _parse_numbers(row.get("chapter_numbers")),
        "engine": row["engine"],
        "voice": row["voice"],
        "rate": row["rate"],
        "bgm_enabled": bool(row["bgm_enabled"]),
        "status": row["status"],
        "error_message": row.get("error_message"),
    }


def _missing_table(exc: BaseException) -> bool:
    return isinstance(exc, pymysql.err.ProgrammingError) and bool(exc.args) and exc.args[0] == 1146


def fetch_job(job_id: int) -> dict[str, Any] | None:
    try:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM tts_jobs WHERE id=?", (job_id,)).fetchone()
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
                SELECT * FROM tts_jobs
                WHERE status IN ('pending', 'running')
                ORDER BY FIELD(status, 'running', 'pending'), id
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
    """Chuyển pending/running thành running. False nếu job đã dừng hoặc không còn."""
    with get_db() as conn:
        conn.execute(
            """
            UPDATE tts_jobs
            SET status='running',
                started_at=COALESCE(started_at, NOW()),
                updated_at=NOW()
            WHERE id=? AND status IN ('pending', 'running')
            """,
            (job_id,),
        )
        row = conn.execute("SELECT status FROM tts_jobs WHERE id=?", (job_id,)).fetchone()
    return bool(row and row["status"] == "running")


def set_chapter_numbers(job_id: int, numbers: list[int]) -> None:
    with get_db() as conn:
        conn.execute(
            """
            UPDATE tts_jobs
            SET chapter_numbers=?, updated_at=NOW()
            WHERE id=? AND status='running'
            """,
            (json.dumps(numbers), job_id),
        )


def mark_if_running(job_id: int, status: str, error_message: str | None = None) -> bool:
    """Đổi status chỉ khi job vẫn running. Không ghi đè stopped."""
    message = (error_message or None)
    if message:
        message = message[:4000]
    with get_db() as conn:
        conn.execute(
            """
            UPDATE tts_jobs
            SET status=?, finished_at=NOW(), error_message=?, updated_at=NOW()
            WHERE id=? AND status='running'
            """,
            (status, message, job_id),
        )
        row = conn.execute("SELECT status FROM tts_jobs WHERE id=?", (job_id,)).fetchone()
    return bool(row and row["status"] == status)
