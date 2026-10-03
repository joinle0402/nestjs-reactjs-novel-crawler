"""Kiểm tra Drive không tương tác cho web preview: in JSON ra stdout.

usage: drive_check.py NOVEL_ID
Output: {"ok": true, "folder_path": "...", "existing": ["..."]}
Lỗi auth/lỗi khác: {"ok": false, "reason": "..."} — luôn exit 0 để backend đọc được JSON.
"""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from config import GDRIVE_ROOT_FOLDER
from db import get_novel_by_id
from drive_upload import _existing_names_in_folder, _find_or_create_folder, _get_service, _safe_filename


def main() -> None:
    novel_id = int(sys.argv[1])
    novel = get_novel_by_id(novel_id)
    if not novel:
        print(json.dumps({"ok": False, "reason": f"Không tìm thấy novel id={novel_id}"}))
        return

    try:
        service = _get_service(interactive=False)
        root_id = _find_or_create_folder(service, GDRIVE_ROOT_FOLDER)
        folder_name = _safe_filename(novel.title)
        folder_id = _find_or_create_folder(service, folder_name, root_id)
        existing = sorted(_existing_names_in_folder(service, folder_id))
        print(
            json.dumps(
                {
                    "ok": True,
                    "folder_path": f"{GDRIVE_ROOT_FOLDER}/{folder_name}",
                    "folder_id": folder_id,
                    "existing": existing,
                },
                ensure_ascii=False,
            )
        )
    except Exception as exc:
        traceback.print_exc()
        print(json.dumps({"ok": False, "reason": str(exc)[:300]}, ensure_ascii=False))


if __name__ == "__main__":
    main()