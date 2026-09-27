"""Gọi process VieNeu từ worker Python 3.8. Model nằm trong process con, load một lần."""

from __future__ import annotations

import atexit
import json
import os
import subprocess
import threading
import time
from pathlib import Path

from log_utils import format_duration, format_elapsed, log_message

WORKER_DIR = Path(__file__).resolve().parent
_READY_TIMEOUT_SEC = 1800.0


def _is_vieneu_cached() -> bool:
    """Kiểm tra snapshot model VieNeu đã có sẵn trong local cache chưa."""
    hf_home = os.environ.get("HF_HOME") or os.environ.get("HUGGINGFACE_HUB_CACHE")
    if hf_home:
        cache_dir = Path(hf_home)
        if not (cache_dir / "models--pnnbao-ump--VieNeu-TTS-v3-Turbo").exists():
            cache_dir = cache_dir / "hub"
    else:
        cache_dir = Path.home() / ".cache" / "huggingface" / "hub"

    snapshots = cache_dir / "models--pnnbao-ump--VieNeu-TTS-v3-Turbo" / "snapshots"
    return snapshots.is_dir() and any(snapshots.iterdir())


def _read_env_quiet(path: Path) -> dict[str, str]:
    """Đọc file .env an toàn mà không in log hay hiển thị token."""
    out: dict[str, str] = {}
    if not path.is_file():
        return out
    try:
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, _, v = line.partition("=")
            key = k.strip()
            val = v.strip().strip('"').strip("'")
            if key:
                out[key] = val
    except Exception:
        pass
    return out


def vieneu_python() -> Path:
    override = os.environ.get("VIENEU_PYTHON", "").strip()
    if override:
        path = Path(override)
        if not path.is_file():
            raise RuntimeError(f"VIENEU_PYTHON không tồn tại: {override}")
        return path
    venv_python = WORKER_DIR / ".venv-vieneu" / "Scripts" / "python.exe"
    if venv_python.is_file():
        return venv_python
    raise RuntimeError(
        "Chưa có môi trường VieNeu (Python >= 3.10). "
        "Tạo worker/.venv-vieneu rồi cài: pip install -r requirements-vieneu.txt"
    )


class _VieNeuClient:
    def __init__(self) -> None:
        self._proc: subprocess.Popen | None = None
        self._lock = threading.Lock()
        self._log_lock = threading.Lock()
        self._stderr_thread: threading.Thread | None = None
        self._log_started_at: float | None = None
        self._log_last_at: float | None = None

    def _log_vieneu(self, message: str) -> None:
        now = time.perf_counter()
        with self._log_lock:
            if self._log_started_at is None:
                self._log_started_at = now
                self._log_last_at = now
            last = self._log_last_at or now
            segment_seconds = max(0.0, now - last)
            total_seconds = max(0.0, now - (self._log_started_at or now))
            self._log_last_at = now
        log_message(
            f"[VieNeu] {message}"
            f" | thời gian đoạn: {format_elapsed(segment_seconds):>9}"
            f" | tổng thời gian: {format_elapsed(total_seconds):>9}"
            f" ({format_duration(total_seconds)})"
        )

    def synthesize(self, text: str, output_path: Path, voice: str) -> None:
        with self._lock:
            self._ensure()
            assert self._proc is not None and self._proc.stdin is not None
            payload = json.dumps(
                {"text": text, "voice": voice, "output": str(output_path.resolve())},
                ensure_ascii=False,
            )
            self._proc.stdin.write(payload + "\n")
            self._proc.stdin.flush()
            message = self._read_message(None)
            if not message.get("ok"):
                raise RuntimeError(str(message.get("error") or "VieNeu không tạo được audio"))

    def close(self) -> None:
        """Dừng process kể cả khi synthesize đang giữ lock (nhấn dừng job)."""
        proc = self._proc
        if proc is None or proc.poll() is not None:
            return
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)

    def _ensure(self) -> None:
        if self._proc is not None and self._proc.poll() is None:
            return
        self._stop()
        with self._log_lock:
            self._log_started_at = None
            self._log_last_at = None
        python = vieneu_python()
        script = WORKER_DIR / "tts_vieneu.py"

        # Đọc bổ sung worker/.env và backend/.env để nạp secret HF_TOKEN / HF_HUB_OFFLINE nếu process chưa có
        file_env = _read_env_quiet(WORKER_DIR / ".env")
        for k, v in _read_env_quiet(WORKER_DIR.parent / "backend" / ".env").items():
            if k not in file_env:
                file_env[k] = v

        env = {
            **file_env,
            **os.environ,
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
        }

        # Local-first: nếu model đã có trong cache và chưa chỉ định HF_HUB_OFFLINE, bật = 1 để bỏ qua kiểm tra mạng
        if "HF_HUB_OFFLINE" not in env and _is_vieneu_cached():
            env["HF_HUB_OFFLINE"] = "1"

        if env.get("HF_HUB_OFFLINE") == "1":
            self._log_vieneu("Đang khởi tạo model (local cache)...")
        else:
            self._log_vieneu("đang tải model (lần đầu có thể mất vài phút)...")

        self._proc = subprocess.Popen(
            [str(python), "-u", str(script)],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(WORKER_DIR),
            text=True,
            encoding="utf-8",
            errors="replace",
            bufsize=1,
            env=env,
        )
        self._stderr_thread = threading.Thread(
            target=self._drain_stderr,
            args=(self._proc,),
            name="VieNeuStderr",
            daemon=True,
        )
        self._stderr_thread.start()
        ready = self._read_message(_READY_TIMEOUT_SEC)
        if not ready.get("ready"):
            error = str(ready.get("error") or "không tải được model")
            self._stop()
            raise RuntimeError(f"VieNeu: {error}")
        self._log_vieneu("model sẵn sàng.")

    def _drain_stderr(self, proc: subprocess.Popen) -> None:
        stream = proc.stderr
        if stream is None:
            return
        try:
            for line in stream:
                text = line.rstrip()
                if text:
                    self._log_vieneu(text)
        except Exception:
            return

    def _read_message(self, timeout: float | None) -> dict:
        proc = self._proc
        if proc is None or proc.stdout is None:
            raise RuntimeError("VieNeu chưa chạy")
        holder: dict[str, str] = {}

        def _read() -> None:
            assert proc.stdout is not None
            holder["line"] = proc.stdout.readline()

        reader = threading.Thread(target=_read, name="VieNeuStdout", daemon=True)
        reader.start()
        reader.join(timeout)
        if reader.is_alive():
            self._stop()
            raise RuntimeError("VieNeu không phản hồi (hết thời gian chờ model)")
        line = holder.get("line", "")
        if not line:
            code = proc.poll()
            self._stop()
            raise RuntimeError(f"VieNeu thoát đột ngột (code={code})")
        try:
            message = json.loads(line)
        except json.JSONDecodeError as exc:
            self._stop()
            raise RuntimeError(f"VieNeu trả dữ liệu không đọc được: {line[:200]}") from exc
        if not isinstance(message, dict):
            raise RuntimeError("VieNeu trả dữ liệu không phải object")
        return message

    def _stop(self) -> None:
        proc = self._proc
        self._proc = None
        if proc is None or proc.poll() is not None:
            return
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


_client = _VieNeuClient()


def synthesize_vieneu(text: str, output_path: Path, voice: str) -> None:
    _client.synthesize(text, output_path, voice)


def close_vieneu() -> None:
    _client.close()


atexit.register(close_vieneu)