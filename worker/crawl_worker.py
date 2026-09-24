"""Worker nền: nhận crawl_jobs và spawn crawl_job_runner.

Một process giữ lock. Chrome headed dùng chung browser state, nên chỉ một job.
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

from crawl_jobs import fetch_active_job, fetch_job, mark_if_open, reset_running_chapters

LOCK_PATH = WORKER_DIR / "crawl_worker.lock"
PID_PATH = WORKER_DIR / "crawl_runner.pid"
RUNNER_PATH = WORKER_DIR / "crawl_job_runner.py"
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
        # Không CREATE_NEW_CONSOLE: cửa sổ mới làm Popen thấy process thoát ngay,
        # worker spawn lần hai và đánh job failed trong lúc Chrome vẫn đang chạy.
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


def _after_exit(job_id: int) -> None:
    job = fetch_job(job_id)
    if not job:
        return
    if job["status"] in ("running", "paused", "waiting_for_manual_action"):
        reset_running_chapters(job["novel_id"], job_id)
        mark_if_open(job_id, "failed", "Crawler dừng giữa chừng")


def _live_runner_pid(proc: subprocess.Popen | None) -> int | None:
    pid = read_runner_pid()
    if not pid or not pid_alive(pid):
        return None
    if proc is not None and pid == proc.pid and proc.poll() is not None:
        return None
    return pid


def monitor(job_id: int, proc: subprocess.Popen | None, pid: int | None) -> None:
    while True:
        alive = (proc.poll() is None) if proc is not None else bool(pid and pid_alive(pid))
        job = fetch_job(job_id)
        if job and job["status"] == "cancelled":
            if proc is not None and proc.poll() is None:
                _interrupt_proc(proc)
            elif pid:
                _interrupt_pid(pid)
            return
        if not alive:
            attached = None
            for _ in range(10):
                attached = _live_runner_pid(proc)
                if attached:
                    break
                time.sleep(0.2)
            if attached:
                proc = None
                pid = attached
                continue
            _after_exit(job_id)
            return
        time.sleep(0.4)


def tick() -> None:
    job = fetch_active_job()
    if not job:
        time.sleep(0.5)
        return
    job_id = int(job["id"])
    status = job["status"]
    pid = read_runner_pid()
    alive = bool(pid and pid_alive(pid))

    if status == "paused":
        if alive:
            monitor(job_id, None, pid)
        else:
            time.sleep(0.5)
        return

    if status == "waiting_for_manual_action":
        if alive:
            monitor(job_id, None, pid)
            return
        reset_running_chapters(job["novel_id"], job_id)
        mark_if_open(job_id, "failed", "Trình duyệt đã đóng trong lúc chờ thao tác thủ công")
        return

    if alive:
        print(f"[Crawl worker] gắn vào runner pid={pid} job={job_id}", flush=True)
        monitor(job_id, None, pid)
        return

    print(f"[Crawl worker] chạy job={job_id} status={status}", flush=True)
    proc = spawn_runner(job_id)
    monitor(job_id, proc, None)


def main() -> None:
    _configure_stdio()
    if not acquire_lock():
        print("[Crawl worker] process khác đang chạy, thoát.", flush=True)
        return
    print("[Crawl worker] đang chờ job.", flush=True)
    while True:
        try:
            tick()
        except KeyboardInterrupt:
            print("\n[Crawl worker] dừng.", flush=True)
            return
        except Exception:
            traceback.print_exc()
            time.sleep(2)


if __name__ == "__main__":
    main()
