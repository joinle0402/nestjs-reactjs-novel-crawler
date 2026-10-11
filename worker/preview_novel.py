"""Đọc metadata truyện bằng Playwright headless. In một dòng JSON ra stdout."""

from __future__ import annotations

import json
import sys

from crawler import preview_novel


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        print("PREVIEW_ERROR: Thiếu URL truyện", file=sys.stderr)
        sys.exit(2)
    try:
        payload = preview_novel(sys.argv[1])
    except Exception as exc:
        print(f"PREVIEW_ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
