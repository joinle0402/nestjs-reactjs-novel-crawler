"""Process engine TTS sống dài cho VieNeu / ZeroTTS.

Nạp model một lần rồi phục vụ nhiều job TTS, nhiều lần nghe thử và crawl.
Giao thức: JSON-line qua TCP loopback; mỗi request mang token trong file
worker/.runtime/engine-<engine>.json.

Chạy trực tiếp chỉ để debug:
    python tts_engine_server.py --engine vieneu --fingerprint dev --token dev
"""

from __future__ import annotations

import argparse
import hmac
import importlib
import json
import os
import signal
import socket
import sys
import threading
import time
import traceback
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from engine_client import (  # noqa: E402
    ENGINE_NAMES,
    RUNTIME_DIR,
    _clear_state,
    _write_state,
    engine_label,
)
from log_utils import format_duration, format_elapsed, log_message  # noqa: E402

IDLE_CHECK_SEC = 15.0
MAX_REQUEST_BYTES = 2_000_000


def _configure_stdio() -> None:
    for name in ("stdin", "stdout", "stderr"):
        stream = getattr(sys, name, None)
        if stream is not None and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def _read_idle_minutes() -> int:
    """0 = không tự tắt. Env TTS_ENGINE_IDLE_MINUTES được ưu tiên hơn file cài đặt."""
    raw = os.environ.get("TTS_ENGINE_IDLE_MINUTES")
    if raw is None or not raw.strip():
        try:
            data = json.loads((WORKER_DIR / "tts_settings.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return 0
        raw = data.get("engineIdleMinutes") if isinstance(data, dict) else None
    try:
        minutes = int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return 0
    return max(0, minutes)


class _Activity:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.active = 0
        self.last_done = time.monotonic()

    def begin(self) -> None:
        with self._lock:
            self.active += 1

    def end(self) -> None:
        with self._lock:
            self.active = max(0, self.active - 1)
            self.last_done = time.monotonic()

    def idle_seconds(self) -> float:
        with self._lock:
            if self.active > 0:
                return 0.0
            return time.monotonic() - self.last_done


def _send(conn: socket.socket, payload: dict) -> None:
    line = json.dumps(payload, ensure_ascii=False) + "\n"
    try:
        conn.sendall(line.encode("utf-8"))
    except UnicodeEncodeError:
        conn.sendall((json.dumps(payload, ensure_ascii=True) + "\n").encode("utf-8"))


def _read_request(conn: socket.socket) -> dict:
    buffer = bytearray()
    while b"\n" not in buffer:
        chunk = conn.recv(65536)
        if not chunk:
            return {}
        buffer.extend(chunk)
        if len(buffer) > MAX_REQUEST_BYTES:
            raise ValueError("Yêu cầu quá lớn")
    line = bytes(buffer).split(b"\n", 1)[0].decode("utf-8", "replace")
    request = json.loads(line)
    if not isinstance(request, dict):
        raise ValueError("Yêu cầu không phải object JSON")
    return request


def _handle(
    conn: socket.socket,
    engine_name: str,
    engine,
    module,
    token: str,
    state: dict,
    activity: _Activity,
    model_lock: threading.Lock,
    stop_event: threading.Event,
) -> None:
    try:
        conn.settimeout(60.0)
        request = _read_request(conn)
        if not request:
            return
        if not hmac.compare_digest(str(request.get("token") or ""), token):
            _send(conn, {"ok": False, "error": "unauthorized"})
            return
        command = str(request.get("cmd") or "")
        if command == "ping":
            _send(
                conn,
                {
                    "ok": True,
                    "pid": os.getpid(),
                    "engine": engine_name,
                    "fingerprint": state["fingerprint"],
                },
            )
            return
        if command == "list_voices":
            activity.begin()
            try:
                with model_lock:
                    voices = module.list_voices(engine)
            finally:
                activity.end()
            _send(conn, {"ok": True, "voices": voices})
            return
        if command == "synthesize":
            activity.begin()
            started = time.monotonic()
            try:
                with model_lock:
                    module.synthesize(engine, request)
            finally:
                activity.end()
            elapsed = time.monotonic() - started
            text_len = len(str(request.get("text") or ""))
            log_message(
                f"synth ok: {text_len} ký tự, voice={request.get('voice')}, "
                f"{format_elapsed(elapsed)}",
                file=sys.stderr,
            )
            _send(conn, {"ok": True, "seconds": elapsed})
            return
        if command == "shutdown":
            _send(conn, {"ok": True})
            log_message("nhận lệnh shutdown", file=sys.stderr)
            stop_event.set()
            return
        _send(conn, {"ok": False, "error": f"Lệnh không hỗ trợ: {command}"})
    except Exception as exc:
        log_message(f"lỗi xử lý request: {type(exc).__name__}: {exc}", file=sys.stderr)
        try:
            _send(conn, {"ok": False, "error": f"{type(exc).__name__}: {exc}"})
        except OSError:
            pass
    finally:
        try:
            conn.close()
        except OSError:
            pass


def _idle_monitor(activity: _Activity, stop_event: threading.Event) -> None:
    while not stop_event.wait(IDLE_CHECK_SEC):
        minutes = _read_idle_minutes()
        if minutes <= 0:
            continue
        idle = activity.idle_seconds()
        if idle >= minutes * 60:
            log_message(
                f"rảnh {format_duration(idle)} ≥ {minutes} phút — tự tắt để giải phóng bộ nhớ",
                file=sys.stderr,
            )
            stop_event.set()
            return


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", required=True, choices=list(ENGINE_NAMES))
    parser.add_argument("--fingerprint", required=True)
    parser.add_argument("--token", required=True)
    args = parser.parse_args()

    _configure_stdio()
    engine_name = args.engine
    label = engine_label(engine_name)
    module = importlib.import_module(f"tts_{engine_name}")

    log_message(f"nạp model {label}...", file=sys.stderr)
    started_at = time.monotonic()
    try:
        engine = module.load_engine()
    except Exception as exc:
        log_message(f"nạp model thất bại: {type(exc).__name__}: {exc}", file=sys.stderr)
        traceback.print_exc()
        return 1
    elapsed = time.monotonic() - started_at
    log_message(
        f"model sẵn sàng sau {format_elapsed(elapsed)} ({format_duration(elapsed)})",
        file=sys.stderr,
    )

    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(("127.0.0.1", 0))
    server.listen(8)
    server.settimeout(0.5)
    port = int(server.getsockname()[1])

    state = {
        "engine": engine_name,
        "pid": os.getpid(),
        "port": port,
        "token": args.token,
        "fingerprint": args.fingerprint,
        "startedAt": time.time(),
        "python": sys.executable,
    }
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    _write_state(engine_name, state)
    log_message(f"nghe tại 127.0.0.1:{port} (pid={os.getpid()})", file=sys.stderr)

    stop_event = threading.Event()
    activity = _Activity()
    model_lock = threading.Lock()
    threading.Thread(
        target=_idle_monitor,
        args=(activity, stop_event),
        name="EngineIdle",
        daemon=True,
    ).start()

    def _stop(_signum, _frame):
        stop_event.set()

    try:
        signal.signal(signal.SIGTERM, _stop)
        signal.signal(signal.SIGINT, _stop)
    except (ValueError, OSError):
        pass

    try:
        while not stop_event.is_set():
            try:
                conn, _address = server.accept()
            except socket.timeout:
                continue
            except OSError:
                break
            threading.Thread(
                target=_handle,
                args=(
                    conn,
                    engine_name,
                    engine,
                    module,
                    args.token,
                    state,
                    activity,
                    model_lock,
                    stop_event,
                ),
                name="EngineRequest",
                daemon=True,
            ).start()
    finally:
        try:
            server.close()
        except OSError:
            pass
        _clear_state(engine_name, os.getpid())
        log_message("đã dừng.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
