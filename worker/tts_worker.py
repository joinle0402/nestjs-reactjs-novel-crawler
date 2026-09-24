"""Worker nền: nhận tts_jobs pending/running và spawn tts_job_runner.

Chỉ một process giữ lock. Restart vẫn đọc job từ DB.
JobManager trong console không được dùng làm kho job của web.
"""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
import traceback
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from db import reset_processing_tts_chapters
from tts_jobs import fetch_active_job, fetch_job, mark_if_running

LOCK_PATH = WORKER_DIR / "tts_worker.lock"
PID_PATH = WORKER_DIR / "tts_runner.pid"
RUNNER_PATH = WORKER_DIR / "tts_job_runner.py"
_lock_handle = None


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


def acquire_lock() -> bool:
    global _lock_handle
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    _lock_handle = open(LOCK_PATH, "a+b")
    if _lock_handle.seek(0, os.SEEK_END) == 0:
        _lock_handle.write(b"\0")
        _lock_handle.flush()
    _lock_handle.seek(0)
    try:
        if sys.platform == "win32":
            import msvcrt

            msvcrt.locking(_lock_handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(_lock_handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return False
    return True


def read_runner_pid() -> int | None:
    try:
        return int(PID_PATH.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None


def pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        import ctypes

        handle = ctypes.windll.kernel32.OpenProcess(0x1000, 0, pid)
        if not handle:
            return False
        ctypes.windll.kernel32.CloseHandle(handle)
        return True
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def spawn_runner(job_id: int) -> subprocess.Popen:
    command = [sys.executable, "-u", str(RUNNER_PATH), str(job_id)]
    kwargs: dict = {"cwd": str(WORKER_DIR)}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen(command, **kwargs)


def _interrupt_proc(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    try:
        if sys.platform == "win32":
            proc.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            proc.send_signal(signal.SIGINT)
    except Exception:
        pass
    try:
        proc.wait(timeout=8)
        return
    except subprocess.TimeoutExpired:
        pass
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def _interrupt_pid(pid: int) -> None:
    try:
        if sys.platform == "win32":
            os.kill(pid, signal.CTRL_BREAK_EVENT)
        else:
            os.kill(pid, signal.SIGINT)
    except OSError:
        pass
    for _ in range(16):
        if not pid_alive(pid):
            return
        time.sleep(0.5)
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        pass


def _after_exit(job_id: int, novel_id: int) -> None:
    job = fetch_job(job_id)
    if job and job["status"] == "running":
        mark_if_running(job_id, "failed", "TTS worker dừng giữa chừng")
        reset_processing_tts_chapters(novel_id)


def monitor_proc(proc: subprocess.Popen, job_id: int, novel_id: int) -> None:
    while proc.poll() is None:
        job = fetch_job(job_id)
        if job and job["status"] == "stopped":
            _interrupt_proc(proc)
            reset_processing_tts_chapters(novel_id)
            return
        time.sleep(0.4)
    _after_exit(job_id, novel_id)


def monitor_pid(pid: int, job_id: int, novel_id: int) -> None:
    while pid_alive(pid):
        job = fetch_job(job_id)
        if job and job["status"] == "stopped":
            _interrupt_pid(pid)
            reset_processing_tts_chapters(novel_id)
            return
        time.sleep(0.4)
    _after_exit(job_id, novel_id)


def tick() -> None:
    job = fetch_active_job()
    if not job:
        time.sleep(0.5)
        return
    job_id = int(job["id"])
    novel_id = int(job["novel_id"])
    pid = read_runner_pid()
    if pid and pid_alive(pid):
        print(f"[TTS worker] gắn vào runner pid={pid} job={job_id}", flush=True)
        monitor_pid(pid, job_id, novel_id)
        return
    print(f"[TTS worker] chạy job={job_id} novel={novel_id} status={job['status']}", flush=True)
    proc = spawn_runner(job_id)
    monitor_proc(proc, job_id, novel_id)


def main() -> None:
    _configure_stdio()
    if not acquire_lock():
        print("[TTS worker] process khác đang chạy, thoát.", flush=True)
        return
    print("[TTS worker] đang chờ job.", flush=True)
    while True:
        try:
            tick()
        except KeyboardInterrupt:
            print("\n[TTS worker] dừng.", flush=True)
            return
        except Exception:
            traceback.print_exc()
            time.sleep(2)


if __name__ == "__main__":
    main()
