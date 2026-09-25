"""Chạy một tts_jobs: parse phạm vi bằng chapter_range.py rồi gọi generate_mp3_for_novel."""

from __future__ import annotations

import os
import shutil
import signal
import sys
import threading
import traceback
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from chapter_range import ChapterRangeError, parse_chapter_range
from config import BGM_PATH
from db import (
    _mp3_needs_generation,
    chapter_has_content,
    get_chapters_for_novel,
    get_novel_by_id,
    reset_processing_tts_chapters,
)
from tts import generate_mp3_for_novel
from tts_jobs import claim_job, fetch_job, mark_if_running, set_chapter_numbers

PID_PATH = WORKER_DIR / "tts_runner.pid"


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


def bgm_block_reason(use_bgm: bool) -> str | None:
    """generate_mp3 trả [] khi bật nhạc nền mà thiếu ffmpeg — job phải failed, không completed."""
    if not use_bgm:
        return None
    if not BGM_PATH or not Path(BGM_PATH).is_file():
        return None
    if shutil.which("ffmpeg") is None:
        return "Nhạc nền cần ffmpeg (pydub). Cài ffmpeg hoặc tắt nhạc nền."
    return None


def resolve_work_numbers(job: dict) -> list[int]:
    chapters = get_chapters_for_novel(int(job["novel_id"]))
    by_number = {ch.chapter_number: ch for ch in chapters}
    runnable = {
        number
        for number, chapter in by_number.items()
        if _mp3_needs_generation(chapter.mp3_path) and chapter_has_content(chapter.content)
    }
    scope = job["scope"]
    if scope == "failed":
        chosen = [
            number
            for number in runnable
            if by_number[number].tts_status == "failed"
        ]
    elif scope == "chapters":
        max_available = max(by_number) if by_number else None
        parsed = parse_chapter_range(
            job.get("chapter_range") or "",
            max_available=max_available,
            use_default_on_empty=False,
        )
        if parsed.is_all:
            chosen = list(runnable)
        else:
            chosen = [number for number in parsed.filter_numbers(list(by_number)) if number in runnable]
    else:
        chosen = list(runnable)
    return sorted(chosen)


def run_job(job_id: int) -> None:
    _write_pid()
    stop_event = threading.Event()
    watcher = threading.Thread(
        target=_watch_stop,
        args=(job_id, stop_event),
        name="TtsStopWatch",
        daemon=True,
    )
    watcher.start()
    novel_id: int | None = None
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
        try:
            numbers = resolve_work_numbers(job)
        except ChapterRangeError as exc:
            mark_if_running(job_id, "failed", str(exc))
            return
        set_chapter_numbers(job_id, numbers)
        if not numbers:
            mark_if_running(job_id, "completed", None)
            print(f"[TTS job {job_id}] không có chương cần tạo", flush=True)
            return
        use_bgm = bool(job["bgm_enabled"])
        block = bgm_block_reason(use_bgm)
        if block:
            print(f"[TTS job {job_id}] {block} — tiếp tục không nhạc nền.", flush=True)
            use_bgm = False
        print(
            f"[TTS job {job_id}] {novel.title} scope={job['scope']} "
            f"voice={job['voice']} rate={job['rate']} bgm={use_bgm} "
            f"chapters={len(numbers)}",
            flush=True,
        )
        generate_mp3_for_novel(
            novel.id,
            novel.title,
            chapter_numbers=frozenset(numbers),
            voice=str(job["voice"]),
            rate=str(job["rate"]),
            use_bgm=use_bgm,
        )
        current = fetch_job(job_id)
        if not current or current["status"] != "running":
            reset_processing_tts_chapters(novel_id)
            return
        mark_if_running(job_id, "completed", None)
        print(f"[TTS job {job_id}] completed", flush=True)
    finally:
        stop_event.set()
        _clear_pid()


def main() -> None:
    _configure_stdio()
    if len(sys.argv) != 2:
        raise SystemExit("usage: tts_job_runner.py JOB_ID")
    job_id = int(sys.argv[1])
    try:
        run_job(job_id)
    except KeyboardInterrupt:
        job = fetch_job(job_id)
        if job:
            reset_processing_tts_chapters(int(job["novel_id"]))
            mark_if_running(job_id, "stopped", None)
        print(f"[TTS job {job_id}] stopped", flush=True)
    except Exception as exc:
        traceback.print_exc()
        job = fetch_job(job_id)
        if job:
            reset_processing_tts_chapters(int(job["novel_id"]))
        mark_if_running(job_id, "failed", str(exc))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
