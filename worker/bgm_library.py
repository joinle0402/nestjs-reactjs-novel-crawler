"""Thư viện nhạc nền dùng chung với backend (worker/bgm/catalog.json)."""

from __future__ import annotations

import json
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
CATALOG_PATH = WORKER_DIR / "bgm" / "catalog.json"
FILES_DIR = WORKER_DIR / "bgm" / "files"


def track_file(track_id: str) -> Path | None:
    """Đường dẫn file audio của một track. None nếu id không có hoặc file mất."""
    track_id = (track_id or "").strip()
    if not track_id or not CATALOG_PATH.is_file():
        return None
    try:
        data = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    tracks = data.get("tracks") if isinstance(data, dict) else None
    if not isinstance(tracks, list):
        return None
    root = FILES_DIR.resolve()
    for track in tracks:
        if not isinstance(track, dict) or str(track.get("id") or "") != track_id:
            continue
        file_name = str(track.get("fileName") or "")
        if not file_name or file_name != Path(file_name).name or ".." in file_name:
            return None
        path = (FILES_DIR / file_name).resolve()
        if root not in path.parents or not path.is_file():
            return None
        return path
    return None
