"""Client cho process engine TTS sống dài (VieNeu / ZeroTTS).

Engine chạy trong process riêng (Python >= 3.10 cho VieNeu, >= 3.9 cho ZeroTTS),
nạp model một lần rồi phục vụ nhiều job, nhiều lần nghe thử và crawl. Nhờ vậy
job TTS tiếp theo không phải nạp lại model.

Giao thức: JSON-line qua TCP loopback (127.0.0.1, port ngẫu nhiên), xác thực
bằng token sinh mỗi lần khởi động. Trạng thái process nằm ở
worker/.runtime/engine-<engine>.json.
"""

from __future__ import annotations

import ctypes
import hashlib
import json
import os
import secrets
import socket
import subprocess
import sys
import threading
import time
from pathlib import Path

from log_utils import format_duration, format_elapsed, log_message

WORKER_DIR = Path(__file__).resolve().parent
RUNTIME_DIR = WORKER_DIR / ".runtime"
SERVER_SCRIPT = WORKER_DIR / "tts_engine_server.py"

READY_TIMEOUT_SEC = 1800.0
CONNECT_TIMEOUT_SEC = 10.0
PING_TIMEOUT_SEC = 10.0
REQUEST_TIMEOUT_SEC = 3600.0
STATE_CACHE_SEC = 15.0
LOG_MAX_BYTES = 5 * 1024 * 1024

ENGINE_NAMES = ("vieneu", "zerotts")
_ENGINE_LABELS = {"vieneu": "VieNeu", "zerotts": "ZeroTTS"}
_ENGINE_PYTHON_ENV = {"vieneu": "VIENEU_PYTHON", "zerotts": "ZEROTTS_PYTHON"}
_ENGINE_VENV = {"vieneu": ".venv-vieneu", "zerotts": ".venv-zerotts"}
_ENGINE_CACHE_DIR = {
    "vieneu": "models--pnnbao-ump--VieNeu-TTS-v3-Turbo",
    "zerotts": "models--zeroweight-ai--ZeroTTS",
}
_FINGERPRINT_ENV = (
    "VIENEU_BACKEND",
    "ZEROTTS_MODEL",
    "HF_HOME",
    "HUGGINGFACE_HUB_CACHE",
    "HF_HUB_OFFLINE",
)


class _TransportError(RuntimeError):
    """Kết nối tới engine bị đứt — thử lại sau khi khởi động lại process."""


def _log(message: str) -> None:
    """Log an toàn cả khi caller chưa reconfigure stdout sang UTF-8."""
    try:
        log_message(message)
    except UnicodeEncodeError:
        log_message(message.encode("ascii", "replace").decode("ascii"))


def engine_label(engine: str) -> str:
    return _ENGINE_LABELS.get(engine, engine)


def engine_python(engine: str) -> Path:
    override = os.environ.get(_ENGINE_PYTHON_ENV.get(engine, ""), "").strip()
    if override:
        path = Path(override)
        if not path.is_file():
            raise RuntimeError(f"{_ENGINE_PYTHON_ENV.get(engine)} không tồn tại: {override}")
        return path
    venv_python = WORKER_DIR / _ENGINE_VENV.get(engine, f".venv-{engine}") / "Scripts" / "python.exe"
    if venv_python.is_file():
        return venv_python
    raise RuntimeError(
        f"Chưa có môi trường {engine_label(engine)} (Python riêng). "
        f"Tạo worker/{_ENGINE_VENV.get(engine)} rồi cài requirements tương ứng."
    )


def runtime_path(engine: str) -> Path:
    return RUNTIME_DIR / f"engine-{engine}.json"


def engine_log_path(engine: str) -> Path:
    return WORKER_DIR / "logs" / f"tts_engine_{engine}.log"


def _lock_path(engine: str) -> Path:
    return RUNTIME_DIR / f"engine-{engine}.lock"


def _is_cached(engine: str) -> bool:
    hf_home = os.environ.get("HF_HOME") or os.environ.get("HUGGINGFACE_HUB_CACHE")
    if hf_home:
        cache_dir = Path(hf_home)
        if not (cache_dir / _ENGINE_CACHE_DIR[engine]).exists():
            cache_dir = cache_dir / "hub"
    else:
        cache_dir = Path.home() / ".cache" / "huggingface" / "hub"
    snapshots = cache_dir / _ENGINE_CACHE_DIR[engine] / "snapshots"
    return snapshots.is_dir() and any(snapshots.iterdir())


def _fingerprint_files(engine: str) -> list:
    files = [SERVER_SCRIPT, WORKER_DIR / "engine_client.py", WORKER_DIR / f"tts_{engine}.py"]
    if engine == "vieneu":
        ref_dir = WORKER_DIR / "ref_voices"
        if ref_dir.is_dir():
            files.extend(
                sorted(path for path in ref_dir.iterdir() if path.suffix.lower() in (".wav", ".mp3"))
            )
    return files


def fingerprint(engine: str) -> str:
    """Dấu vân tay của engine: đổi code / env / giọng clone thì process cũ phải nạp lại."""
    parts = [f"engine={engine}", f"python={engine_python(engine)}"]
    for key in _FINGERPRINT_ENV:
        parts.append(f"{key}={os.environ.get(key, '')}")
    for path in _fingerprint_files(engine):
        try:
            stat = path.stat()
            parts.append(f"{path.name}:{stat.st_size}:{stat.st_mtime_ns}")
        except OSError:
            parts.append(f"{path.name}:missing")
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()[:16]


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        handle = ctypes.windll.kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid)
        if not handle:
            return False
        try:
            exit_code = ctypes.c_ulong()
            if ctypes.windll.kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code)):
                return exit_code.value == 259  # STILL_ACTIVE
            return False
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def read_state(engine: str) -> dict:
    path = runtime_path(engine)
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _write_state(engine: str, state: dict) -> None:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    path = runtime_path(engine)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, path)


def _clear_state(engine: str, pid: int | None = None) -> None:
    if pid is not None:
        current = read_state(engine)
        if current and int(current.get("pid") or 0) not in (0, pid):
            return
    try:
        runtime_path(engine).unlink()
    except OSError:
        pass


def _read_env_quiet(path: Path) -> dict:
    """Đọc bổ sung worker/.env mà không in giá trị ra log."""
    out: dict = {}
    if not path.is_file():
        return out
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key:
                out[key] = value
    except Exception:
        pass
    return out


def _engine_env() -> dict:
    file_env = _read_env_quiet(WORKER_DIR / ".env")
    for key, value in _read_env_quiet(WORKER_DIR.parent / "backend" / ".env").items():
        file_env.setdefault(key, value)
    env = {
        **file_env,
        **os.environ,
        "PYTHONIOENCODING": "utf-8",
        "PYTHONUTF8": "1",
    }
    return env


def _rotate_log(path: Path) -> None:
    try:
        if path.is_file() and path.stat().st_size > LOG_MAX_BYTES:
            backup = path.with_name(path.name + ".1")
            try:
                backup.unlink()
            except OSError:
                pass
            os.replace(path, backup)
    except OSError:
        pass


def _scrub(text: str) -> str:
    for key, value in os.environ.items():
        if not value or len(value) < 8:
            continue
        upper = key.upper()
        if any(word in upper for word in ("TOKEN", "SECRET", "PASSWORD", "KEY")):
            text = text.replace(value, "***")
    return text


def _log_tail(engine: str, lines: int = 8) -> str:
    path = engine_log_path(engine)
    try:
        content = path.read_text(encoding="utf-8", errors="replace").splitlines()
    except OSError:
        return ""
    tail = [line for line in content[-lines:] if line.strip()]
    return _scrub("\n".join(tail))[-800:]


class _FileLock:
    """Giữ lock liên process để chỉ một client được spawn engine."""

    def __init__(self, path: Path, timeout: float) -> None:
        self._path = path
        self._timeout = timeout
        self._handle = None

    def __enter__(self):
        self._path.parent.mkdir(parents=True, exist_ok=True)
        handle = open(self._path, "a+b")
        if handle.seek(0, os.SEEK_END) == 0:
            handle.write(b"\0")
            handle.flush()
        handle.seek(0)
        deadline = time.monotonic() + self._timeout
        while True:
            try:
                if sys.platform == "win32":
                    import msvcrt

                    msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
                else:
                    import fcntl

                    fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                self._handle = handle
                return self
            except OSError:
                if time.monotonic() >= deadline:
                    handle.close()
                    raise RuntimeError("Không lấy được lock engine (process khác đang giữ quá lâu)")
                time.sleep(0.25)

    def __exit__(self, *exc_info) -> None:
        handle = self._handle
        if handle is None:
            return
        try:
            handle.seek(0)
            if sys.platform == "win32":
                import msvcrt

                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        except OSError:
            pass
        finally:
            handle.close()
            self._handle = None


class EngineClient:
    def __init__(self, engine: str) -> None:
        if engine not in ENGINE_NAMES:
            raise ValueError(f"Engine không hỗ trợ: {engine}")
        self.engine = engine
        self._request_lock = threading.Lock()
        self._ensure_lock = threading.Lock()
        self._sockets_lock = threading.Lock()
        self._sockets: set = set()
        self._state = {}
        self._state_valid_until = 0.0
        self._warm_logged = False
        self._closing = False

    # -- public API ---------------------------------------------------------

    def synthesize(self, text: str, output_path: Path, voice: str) -> None:
        payload = {
            "cmd": "synthesize",
            "text": text,
            "voice": voice,
            "output": str(Path(output_path).resolve()),
        }
        self._call(payload)

    def list_voices(self) -> list:
        message = self._call({"cmd": "list_voices"})
        voices = message.get("voices")
        return list(voices) if isinstance(voices, list) else []

    def close(self) -> None:
        """Ngắt các kết nối đang chờ (dừng job), KHÔNG tắt engine đã nạp model."""
        self._closing = True
        with self._sockets_lock:
            sockets = list(self._sockets)
        for sock in sockets:
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            try:
                sock.close()
            except OSError:
                pass

    # -- request path -------------------------------------------------------

    def _call(self, payload: dict) -> dict:
        with self._request_lock:
            last_error = ""
            for attempt in range(2):
                if self._closing:
                    raise RuntimeError(f"{engine_label(self.engine)}: đã dừng")
                state = self._ensure()
                try:
                    return self._request(state, payload, REQUEST_TIMEOUT_SEC)
                except _TransportError as exc:
                    last_error = str(exc)
                    self._invalidate()
                    if self._closing:
                        raise RuntimeError(f"{engine_label(self.engine)}: đã dừng") from exc
                    if attempt == 0:
                        _log(
                            f"[{engine_label(self.engine)}] engine không phản hồi "
                            f"({exc}); thử khởi động lại..."
                        )
            raise RuntimeError(f"{engine_label(self.engine)} không phản hồi: {last_error}")

    def _invalidate(self) -> None:
        self._state = {}
        self._state_valid_until = 0.0
        self._warm_logged = False

    def _ensure(self) -> dict:
        now = time.monotonic()
        if self._state and now < self._state_valid_until:
            return self._state
        with self._ensure_lock:
            if self._state and time.monotonic() < self._state_valid_until:
                return self._state
            current = fingerprint(self.engine)
            state = self._live_state(current)
            if not state:
                with _FileLock(_lock_path(self.engine), READY_TIMEOUT_SEC):
                    state = self._live_state(current)
                    if not state:
                        self._reap_stale()
                        state = self._spawn(current)
            self._state = state
            self._state_valid_until = time.monotonic() + STATE_CACHE_SEC
            return state

    def _reap_stale(self) -> None:
        """Dọn state cũ trước khi spawn: gửi shutdown, không kill PID lạ."""
        state = read_state(self.engine)
        if not state:
            return
        pid = int(state.get("pid") or 0)
        self._shutdown_state(state)
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline and pid and _pid_alive(pid):
            time.sleep(0.2)
        if pid and _pid_alive(pid):
            _log(
                f"[{engine_label(self.engine)}] process cũ pid={pid} không phản hồi shutdown; "
                "bỏ qua và khởi động process mới"
            )
        _clear_state(self.engine, pid or None)

    def _live_state(self, current_fingerprint: str) -> dict:
        state = read_state(self.engine)
        if not state:
            return {}
        if state.get("fingerprint") != current_fingerprint:
            self._shutdown_state(state)
            _clear_state(self.engine, int(state.get("pid") or 0) or None)
            return {}
        if not _pid_alive(int(state.get("pid") or 0)):
            _clear_state(self.engine, int(state.get("pid") or 0) or None)
            return {}
        try:
            message = self._request(state, {"cmd": "ping"}, PING_TIMEOUT_SEC)
        except (RuntimeError, OSError):
            return {}
        if not message.get("ok") or message.get("fingerprint") != current_fingerprint:
            return {}
        if not self._warm_logged:
            _log(f"[{engine_label(self.engine)}] dùng lại model đã nạp (pid={state.get('pid')})")
            self._warm_logged = True
        return state

    def _spawn(self, current_fingerprint: str) -> dict:
        python = engine_python(self.engine)
        token = secrets.token_hex(16)
        log_path = engine_log_path(self.engine)
        log_path.parent.mkdir(parents=True, exist_ok=True)
        _rotate_log(log_path)
        env = _engine_env()
        if "HF_HUB_OFFLINE" not in env and _is_cached(self.engine):
            env["HF_HUB_OFFLINE"] = "1"
        cached = env.get("HF_HUB_OFFLINE") == "1"
        label = engine_label(self.engine)
        if cached:
            _log(f"[{label}] đang khởi tạo model (local cache)...")
        else:
            _log(f"[{label}] đang tải model (lần đầu có thể mất vài phút)...")

        command = [
            str(python),
            "-u",
            str(SERVER_SCRIPT),
            "--engine",
            self.engine,
            "--fingerprint",
            current_fingerprint,
            "--token",
            token,
        ]
        kwargs: dict = {
            "cwd": str(WORKER_DIR),
            "stdin": subprocess.DEVNULL,
            "env": env,
            "close_fds": True,
        }
        if sys.platform == "win32":
            kwargs["creationflags"] = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        else:
            kwargs["start_new_session"] = True

        with open(log_path, "ab", buffering=0) as log_file:
            kwargs["stdout"] = log_file
            kwargs["stderr"] = subprocess.STDOUT
            proc = subprocess.Popen(command, **kwargs)

        started_at = time.monotonic()
        deadline = started_at + READY_TIMEOUT_SEC
        next_notice = started_at + 30
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                tail = _log_tail(self.engine)
                detail = f"\n{tail}" if tail else ""
                raise RuntimeError(
                    f"{label} thoát khi nạp model (code={proc.returncode}). "
                    f"Xem {log_path}{detail}"
                )
            state = read_state(self.engine)
            if state and state.get("token") == token:
                try:
                    message = self._request(state, {"cmd": "ping"}, PING_TIMEOUT_SEC)
                    if message.get("ok"):
                        elapsed = time.monotonic() - started_at
                        _log(
                            f"[{label}] model sẵn sàng sau {format_elapsed(elapsed)} "
                            f"({format_duration(elapsed)}, pid={state.get('pid')})"
                        )
                        return state
                except (RuntimeError, OSError):
                    pass
            now = time.monotonic()
            if now >= next_notice:
                _log(
                    f"[{label}] vẫn đang nạp model... ({format_elapsed(now - started_at)})"
                )
                next_notice = now + 30
            time.sleep(0.3)

        try:
            proc.terminate()
        except OSError:
            pass
        raise RuntimeError(f"{label} không sẵn sàng sau {format_duration(READY_TIMEOUT_SEC)}")

    def _request(self, state: dict, payload: dict, timeout: float) -> dict:
        host = "127.0.0.1"
        port = int(state.get("port") or 0)
        if port <= 0:
            raise _TransportError("thiếu port engine")
        raw = json.dumps(
            {**payload, "token": state.get("token", "")},
            ensure_ascii=False,
        ).encode("utf-8")
        sock = socket.create_connection((host, port), timeout=CONNECT_TIMEOUT_SEC)
        with self._sockets_lock:
            self._sockets.add(sock)
        try:
            sock.settimeout(timeout)
            sock.sendall(raw + b"\n")
            buffer = bytearray()
            while True:
                chunk = sock.recv(65536)
                if not chunk:
                    raise _TransportError("engine đóng kết nối")
                buffer.extend(chunk)
                if b"\n" in chunk:
                    break
                if len(buffer) > 2_000_000:
                    raise _TransportError("phản hồi engine quá lớn")
            line = bytes(buffer).split(b"\n", 1)[0].decode("utf-8", "replace")
            try:
                message = json.loads(line)
            except json.JSONDecodeError as exc:
                raise _TransportError(f"phản hồi không đọc được: {line[:200]}") from exc
            if not isinstance(message, dict):
                raise _TransportError("phản hồi engine không phải object")
            if message.get("ok") is False or message.get("error"):
                raise RuntimeError(str(message.get("error") or "engine báo lỗi"))
            return message
        except socket.timeout as exc:
            raise _TransportError("engine không phản hồi (hết thời gian chờ)") from exc
        except OSError as exc:
            raise _TransportError(str(exc)) from exc
        finally:
            with self._sockets_lock:
                self._sockets.discard(sock)
            try:
                sock.close()
            except OSError:
                pass

    def _shutdown_state(self, state: dict) -> None:
        if not state or not state.get("port"):
            return
        try:
            self._request(state, {"cmd": "shutdown"}, 5.0)
        except (RuntimeError, OSError):
            pass


def shutdown_engine(engine: str) -> bool:
    """Tắt process engine (dùng cho script dọn tay). Trả về True nếu đã gửi lệnh."""
    state = read_state(engine)
    if not state:
        return False
    client = EngineClient(engine)
    client._shutdown_state(state)
    _clear_state(engine, int(state.get("pid") or 0) or None)
    return True
