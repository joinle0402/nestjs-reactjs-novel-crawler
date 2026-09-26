"""Gọi process VieNeu từ worker Python 3.8. Model nằm trong process con, load một lần."""

from __future__ import annotations

import atexit
import json
import os
import subprocess
import threading
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
_READY_TIMEOUT_SEC = 1800.0


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
        self._stderr_thread: threading.Thread | None = None

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
        python = vieneu_python()
        script = WORKER_DIR / "tts_vieneu.py"
        print("[VieNeu] đang tải model (lần đầu có thể mất vài phút)...", flush=True)
        env = {
            **os.environ,
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
        }
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
        print("[VieNeu] model sẵn sàng.", flush=True)

    def _drain_stderr(self, proc: subprocess.Popen) -> None:
        stream = proc.stderr
        if stream is None:
            return
        try:
            for line in stream:
                text = line.rstrip()
                if text:
                    print(f"[VieNeu] {text}", flush=True)
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