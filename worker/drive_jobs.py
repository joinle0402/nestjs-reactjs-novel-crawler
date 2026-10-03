"""Đọc/ghi bảng drive_upload_jobs cho worker web. Không dùng JobManager của console."""

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
        "status": row["status"],
        "total_files": int(row.get("total_files") or 0),
        "uploaded_count": int(row.get("uploaded_count") or 0),
        "skipped_count": int(row.get("skipped_count") or 0),
        "failed_count": int(row.get("failed_count") or 0),
        "current_file": row.get("current_file"),
        "failed_files": row.get("failed_files"),
        "error_message": row.get("error_message"),
    }


def _missing_table(exc: BaseException) -> bool:
    return isinstance(exc, pymysql.err.ProgrammingError) and bool(exc.args) and exc.args[0] == 1146


def fetch_job(job_id: int) -> dict[str, Any] | None:
    try:
        with get_db() as conn:
            row = conn.execute("SELECT * FROM drive_upload_jobs WHERE id=?", (job_id,)).fetchone()
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
                SELECT * FROM drive_upload_jobs
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
            UPDATE drive_upload_jobs
            SET status='running',
                started_at=COALESCE(started_at, NOW()),
                updated_at=NOW()
            WHERE id=? AND status IN ('pending', 'running')
            """,
            (job_id,),
        )
        row = conn.execute("SELECT status FROM drive_upload_jobs WHERE id=?", (job_id,)).fetchone()
    return bool(row and row["status"] == "running")


def set_chapter_numbers(job_id: int, numbers: list[int]) -> None:
    with get_db() as conn:
        conn.execute(
            """
            UPDATE drive_upload_jobs
            SET chapter_numbers=?, updated_at=NOW()
            WHERE id=? AND status='running'
            """,
            (json.dumps(numbers), job_id),
        )


def update_progress(
    job_id: int,
    *,
    uploaded: int,
    skipped: int,
    failed: int,
    total: int,
    current_file: str | None,
) -> None:
    with get_db() as conn:
        conn.execute(
            """
            UPDATE drive_upload_jobs
            SET uploaded_count=?, skipped_count=?, failed_count=?, total_files=?, current_file=?, updated_at=NOW()
            WHERE id=? AND status='running'
            """,
            (uploaded, skipped, failed, total, current_file, job_id),
        )


def set_failed_files(job_id: int, failed_files: list[dict[str, Any]]) -> None:
    with get_db() as conn:
        conn.execute(
            """
            UPDATE drive_upload_jobs
            SET failed_files=?, updated_at=NOW()
            WHERE id=? AND status='running'
            """,
            (json.dumps(failed_files, ensure_ascii=False), job_id),
        )


def set_file_results(job_id: int, file_results: list[dict[str, Any]]) -> None:
    """Ghi kết quả từng file (uploaded/skipped/failed) ngay khi chạy, không đợi cuối job."""
    with get_db() as conn:
        conn.execute(
            """
            UPDATE drive_upload_jobs
            SET file_results=?, updated_at=NOW()
            WHERE id=? AND status='running'
            """,
            (json.dumps(file_results, ensure_ascii=False), job_id),
        )


def mark_if_running(job_id: int, status: str, error_message: str | None = None) -> bool:
    """Đổi status chỉ khi job vẫn running. Không ghi đè stopped."""
    message = (error_message or None)
    if message:
        message = message[:4000]
    with get_db() as conn:
        conn.execute(
            """
            UPDATE drive_upload_jobs
            SET status=?, finished_at=NOW(), error_message=?, updated_at=NOW()
            WHERE id=? AND status='running'
            """,
            (status, message, job_id),
        )
        row = conn.execute("SELECT status FROM drive_upload_jobs WHERE id=?", (job_id,)).fetchone()
    return bool(row and row["status"] == status)