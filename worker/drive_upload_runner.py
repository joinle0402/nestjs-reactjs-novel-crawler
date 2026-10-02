"""Chạy một drive_upload_jobs: chọn MP3 theo scope rồi upload lên Drive."""

from __future__ import annotations

import os
import signal
import sys
import threading
import traceback
from pathlib import Path
from typing import Any

WORKER_DIR = Path(__file__).resolve().parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from chapter_range import ChapterRangeError, parse_chapter_range
from db import get_chapters_with_mp3, get_novel_by_id
from drive_jobs import (
    claim_job,
    fetch_job,
    mark_if_running,
    set_chapter_numbers,
    set_failed_files,
    update_progress,
)
from drive_upload import upload_mp3_files
from log_utils import log_message
from tts import _safe_filename

PID_PATH = WORKER_DIR / "drive_runner.pid"


def _configure_stdio() -> None:
    if sys.platform != "win32":
        return
    for name in ("stdout", "stderr"):
        stream = getattr(sys, name, None)
        if stream is None or not hasattr(stream, "reconfigure"):
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def _write_pid() -> None:
    PID_PATH.write_text(str(os.getpid()), encoding="utf-8")


def _clear_pid() -> None:
    try:
        if PID_PATH.is_file() and PID_PATH.read_text(encoding="utf-8").strip() == str(os.getpid()):
            PID_PATH.unlink()
    except OSError:
        pass


def _watch_stop(job_id: int, stop_event: threading.Event) -> None:
    while not stop_event.wait(0.4):
        job = fetch_job(job_id)
        if job and job["status"] == "stopped":
            try:
                signal.raise_signal(signal.SIGINT)
            except Exception:
                pass
            return


def resolve_work_numbers(job: dict) -> list[int]:
    chapters = get_chapters_with_mp3(int(job["novel_id"]))
    numbers = [ch.chapter_number for ch in chapters]
    scope = job["scope"]
    if scope == "chapters":
        max_available = max(numbers) if numbers else None
        parsed = parse_chapter_range(
            job.get("chapter_range") or "",
            max_available=max_available,
            use_default_on_empty=False,
        )
        if not parsed.is_all:
            return sorted(parsed.filter_numbers(numbers))
    return sorted(numbers)


def run_job(job_id: int) -> None:
    _write_pid()
    stop_event = threading.Event()
    watcher = threading.Thread(
        target=_watch_stop,
        args=(job_id, stop_event),
        name="DriveStopWatch",
        daemon=True,
    )
    watcher.start()
    try:
        if not claim_job(job_id):
            return
        job = fetch_job(job_id)
        if not job or job["status"] != "running":
            return
        novel_id = int(job["novel_id"])
        novel = get_novel_by_id(novel_id)
        if not novel:
            mark_if_running(job_id, "failed", f"Không tìm thấy truyện id={novel_id}")
            return
        numbers = resolve_work_numbers(job)
        set_chapter_numbers(job_id, numbers)
        if not numbers:
            mark_if_running(job_id, "completed", None)
            log_message(f"[Drive job {job_id}] không có chương MP3 nào để upload")
            return

        chapters = [ch for ch in get_chapters_with_mp3(novel_id) if ch.chapter_number in set(numbers)]
        mp3_files = [Path(ch.mp3_path) for ch in chapters if ch.mp3_path and Path(ch.mp3_path).is_file()]
        chapter_by_name = {Path(ch.mp3_path).name: ch.chapter_number for ch in chapters if ch.mp3_path}

        failed_files: list[dict[str, Any]] = []

        def progress(state: dict[str, Any]) -> None:
            last_error = state.get("last_error")
            name = state.get("current")
            if last_error and name:
                failed_files.append(
                    {
                        "chapterNumber": chapter_by_name.get(name, 0),
                        "name": name,
                        "error": str(last_error)[:500],
                    }
                )
            update_progress(
                job_id,
                uploaded=int(state.get("uploaded") or 0),
                skipped=int(state.get("skipped") or 0),
                failed=int(state.get("failed") or 0),
                total=int(state.get("total") or 0),
                current_file=name,
            )

        log_message(
            f"[Drive job {job_id}] {novel.title} scope={job['scope']} files={len(mp3_files)}"
        )
        if not mp3_files:
            mark_if_running(job_id, "failed", "Không có file MP3 nào đọc được trên máy")
            return
        upload_mp3_files(
            mp3_files,
            novel_folder_name=_safe_filename(novel.title),
            interactive=False,
            progress=progress,
        )
        set_failed_files(job_id, failed_files)
        current = fetch_job(job_id)
        if not current or current["status"] != "running":
            return
        mark_if_running(job_id, "completed", None)
        log_message(f"[Drive job {job_id}] completed")
    finally:
        stop_event.set()
        _clear_pid()


def main() -> None:
    _configure_stdio()
    if len(sys.argv) != 2:
        raise SystemExit("usage: drive_upload_runner.py JOB_ID")
    job_id = int(sys.argv[1])
    try:
        run_job(job_id)
    except KeyboardInterrupt:
        mark_if_running(job_id, "stopped", None)
        log_message(f"[Drive job {job_id}] stopped")
    except Exception as exc:
        traceback.print_exc()
        mark_if_running(job_id, "failed", str(exc))
        raise SystemExit(1)


if __name__ == "__main__":
    main()