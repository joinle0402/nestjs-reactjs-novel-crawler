"""Chạy một crawl_jobs: Playwright headed, lưu từng chương, chờ captcha qua DB."""

from __future__ import annotations

import os
import sys
import time
import traceback
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from crawler import CrawlControl, CrawlFailed, CrawlStopped, crawl_novel
from crawl_jobs import (
    attach_novel,
    claim_job,
    count_chapter_statuses,
    enter_waiting,
    fetch_job,
    mark_if_open,
    replace_plan,
    reset_running_chapters,
    set_chapter,
)
PID_PATH = WORKER_DIR / "crawl_runner.pid"


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


class JobCrawlControl(CrawlControl):
    abort_on_forbidden = True

    def __init__(self, job_id: int) -> None:
        self.job_id = job_id

    def wait_manual(self, message: str) -> None:
        print(message, flush=True)
        ui_message = "Giải captcha nếu có, đợi nội dung load xong, rồi bấm Tiếp tục trên trang Crawler."
        if not enter_waiting(self.job_id, ui_message):
            job = fetch_job(self.job_id)
            if job and job["status"] in ("running", "paused", "waiting_for_manual_action"):
                raise CrawlStopped("duplicate")
            raise CrawlStopped("cancelled")
        while True:
            job = fetch_job(self.job_id)
            if not job or job["status"] == "cancelled":
                raise CrawlStopped("cancelled")
            if job["status"] == "running":
                return
            if job["status"] != "waiting_for_manual_action":
                raise CrawlStopped(str(job["status"]))
            time.sleep(0.5)

    def checkpoint(self) -> None:
        while True:
            job = fetch_job(self.job_id)
            if not job or job["status"] == "cancelled":
                raise CrawlStopped("cancelled")
            if job["status"] == "paused":
                time.sleep(0.5)
                continue
            if job["status"] != "running":
                raise CrawlStopped(str(job["status"]))
            return

    def on_novel(self, novel_id: int, title: str) -> None:
        attach_novel(self.job_id, novel_id)
        print(f"[Crawl job {self.job_id}] novel={novel_id} {title}", flush=True)

    def on_chapters_planned(self, rows: list[dict]) -> None:
        replace_plan(self.job_id, rows)

    def on_chapter(self, chapter_number: int, status: str, chapter_id: int | None, error: str | None) -> None:
        set_chapter(self.job_id, chapter_number, status, chapter_id, error)


def _finish(job_id: int) -> None:
    counts = count_chapter_statuses(job_id)
    failed = counts.get("failed", 0)
    if failed:
        mark_if_open(job_id, "completed_with_errors", f"{failed} chương lỗi")
    else:
        mark_if_open(job_id, "completed", None)


def run_job(job_id: int) -> None:
    _write_pid()
    novel_id: int | None = None
    try:
        if not claim_job(job_id):
            return
        job = fetch_job(job_id)
        if not job or job["status"] != "running":
            return
        novel_id = job["novel_id"]
        numbers = job["chapter_numbers"]
        print(f"[Crawl job {job_id}] url={job['url']} scope={job['scope']}", flush=True)
        crawl_novel(
            novel_url=job["url"],
            chapter_numbers=frozenset(numbers) if numbers else None,
            run_tts=False,
            novel_id=novel_id,
            control=JobCrawlControl(job_id),
        )
        current = fetch_job(job_id)
        if not current or current["status"] != "running":
            return
        _finish(job_id)
        print(f"[Crawl job {job_id}] xong", flush=True)
    finally:
        _clear_pid()


def main() -> None:
    _configure_stdio()
    if len(sys.argv) != 2:
        raise SystemExit("usage: crawl_job_runner.py JOB_ID")
    job_id = int(sys.argv[1])
    try:
        run_job(job_id)
    except CrawlStopped as exc:
        job = fetch_job(job_id)
        if job:
            reset_running_chapters(job["novel_id"], job_id)
            if exc.reason == "cancelled":
                mark_if_open(job_id, "cancelled", None)
            elif exc.reason == "duplicate":
                print(f"[Crawl job {job_id}] bỏ qua process trùng", flush=True)
                return
        print(f"[Crawl job {job_id}] dừng ({exc.reason})", flush=True)
    except KeyboardInterrupt:
        job = fetch_job(job_id)
        if job:
            reset_running_chapters(job["novel_id"], job_id)
            mark_if_open(job_id, "cancelled", None)
        print(f"[Crawl job {job_id}] cancelled", flush=True)
    except (CrawlFailed, Exception) as exc:
        traceback.print_exc()
        job = fetch_job(job_id)
        if job:
            reset_running_chapters(job["novel_id"], job_id)
        mark_if_open(job_id, "failed", str(exc))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
