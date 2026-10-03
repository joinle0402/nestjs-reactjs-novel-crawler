---
name: drive-workflow
description: >-
  Map of the Google Drive upload workflow across the React UI, NestJS API, and
  Python worker. Use when changing drive jobs, MP3 upload, OAuth login or token
  refresh, drive preview, skip-existing, stop, or drive job status. Read this
  before opening drive files.
---

# Drive workflow

Project graph: `C-Users-ASUS-Desktop-workspace-project-novel-crawler`.

Use this map, then `search_graph` / `get_code_snippet` for the one symbol you will change. Do not open `worker/drive_upload.py` from the top.

## Flow

1. UI: `frontend/src/features/drive/` — `UploadDriveDrawer`, `DriveJobLine`, `DriveDetailDrawer`, `DriveLogDrawer`, `driveApi`, `useDriveQueries`. `NovelDetailPage` hosts the drawer; `MainLayout` runs the global `useDriveJobWatch` poller and `BottomPlayer` renders `DriveJobLine` while a job is active.
2. API: `DriveController` → `DriveService` (`backend/src/drive/`).
3. Process: `DriveWorkerService` starts `worker/drive_worker.py` on module init (skip with `DRIVE_WORKER_AUTOSTART=0`), which polls `drive_upload_jobs` and spawns `worker/drive_upload_runner.py JOB_ID` per job.
4. Upload: `upload_mp3_files` in `worker/drive_upload.py` — resumable upload into `Drive/{GDRIVE_ROOT_FOLDER}/{novel_folder_name}/`; the `progress` state also carries `uploaded_names` / `skipped_names` so `drive_upload_runner.py` can build per-file results (`{chapterNumber, name, status: uploaded|skipped|failed, error}`) written live via `set_file_results` into the `drive_upload_jobs.file_results` JSON column.
5. Job rows: `worker/drive_jobs.py`. Chapter MP3 paths: `worker/db.py` (`get_chapters_with_mp3`).

The interactive console also uploads (`worker/console/jobs.py` via `upload_novel_mp3_by_id`, optional `GDRIVE_AUTO_AFTER_TTS`). Web jobs never use the console `JobManager` — the table `drive_upload_jobs` is the only store for web.

## Contract

- Scopes: `missing`, `chapters` (`DRIVE_SCOPES` in `backend/src/drive/entities/drive-upload-job.entity.ts`). `missing` uploads every chapter with a ready MP3; `chapters` requires `chapterRange` parsed by `chapter-range` (shared with TTS: `backend/src/tts/chapter-range.ts` + `worker/chapter_range.py`).
- Job statuses: `pending`, `running`, `stopped`, `completed`, `failed` (`DRIVE_JOB_STATUSES`). No paused or waiting state.
- One active drive job at a time. Enforced twice: MySQL `GET_LOCK('novel_crawler_drive_job')` inside `DriveService.insertJob`, and file lock `drive_worker.lock` + pid `drive_runner.pid` in the worker (the worker re-attaches to a live runner pid instead of spawning a second one).
- Skip-existing is by file name inside the novel folder (`_existing_names_in_folder`, `skip_existing=True`). Folder names come from `_safe_filename(novel.title)` (shared with TTS).
- Stop is cooperative and lands between files: `POST /drive/jobs/stop` sets `stopped`; the runner's `_watch_stop` thread polls the job every 0.4s and raises SIGINT; the in-flight resumable upload finishes first. `mark_if_running` never overwrites `stopped`. A runner that dies while the job is still `running` is marked `failed` by `drive_worker._after_exit`.
- Auth: `_get_service(interactive=...)`. Web paths (`drive_upload_runner`, `drive_check`) always use `interactive=False` — the token must already exist; log in once with `python worker/drive_upload.py` (opens browser, saves `token.json`). An invalid/expired refresh token deletes `token.json` and raises a clear error in non-interactive mode.
- Config lives in `worker/config.py`: `GDRIVE_CREDENTIALS` (`client_secret.json`), `GDRIVE_TOKEN` (`token.json`), `GDRIVE_ROOT_FOLDER` (`novel-crawler-mp3`), `GDRIVE_ENABLED`, `GDRIVE_AUTO_AFTER_TTS`. The backend re-reads only these three string constants by regex (`readDriveConfig` in `drive.service.ts`).
- `client_secret.json` and `token.json` are gitignored OAuth secrets. Never print, log, or commit their contents or the token value.
- Preview: `GET /drive/preview` shells out to `python worker/drive_check.py NOVEL_ID` — non-interactive, always exit 0, prints exactly one JSON line (`{"ok", "folder_path", "folder_id", "existing"}`), 120s timeout. The response also exposes `driveFolderId` and `existingNames` (used by the UI for per-chapter Drive status and the Drive folder link). Any failure means `driveChecked: false`, never an HTTP error.
- Worker log: `worker/logs/drive_worker.log` (rewritten with a `--- spawn ---` header on each restart; backend `getLogs` reads the last 128KB).

API surface on `DriveController`: `status`, `preview`, `current`, `last`, `logs`, `start`, `stop`.

## Where to look

| Change | Start here |
| --- | --- |
| Start, stop, preview, single-job lock, progress shaping | `DriveService` in `backend/src/drive/drive.service.ts` |
| Spawn/restart the worker | `DriveWorkerService`, `worker/drive_worker.py` |
| Job rows: claim, progress, failed files, per-file results, status | `claim_job`, `update_progress`, `set_failed_files`, `set_file_results`, `mark_if_running` in `worker/drive_jobs.py` |
| Scope → chapter list for a job | `resolve_work_numbers` in `worker/drive_upload_runner.py`; backend mirror in `DriveService.start` |
| OAuth login, token refresh, credentials | `_get_service`, `login` in `worker/drive_upload.py` |
| Drive folders, skip-existing, upload loop | `_find_or_create_folder`, `_existing_names_in_folder`, `upload_mp3_files` |
| Web preview without login prompts | `worker/drive_check.py` |
| Chapters on-Drive filter (`onDrive` param of `GET /chapters/novel/:id`) | `getOnDriveChapterNumbers` in `DriveService` (drive_check result cached 30s, exported by `DriveModule`) |

Tests matching `*.spec.ts` are excluded from the graph. Read those files directly when the change needs a test.

## Maintaining this skill

After changing drive code in this session, patch this file only when the change makes a fact here false or incomplete. That means a new or removed entry point, status, scope, invariant, or cross-layer contract.

Leave this file unchanged for bugfixes that keep the same contract, private helper renames, formatting, comments, logs, UI copy, and reverted experiments.

When a patch is required:

1. Edit the single stale bullet, table row, or contract line. Add one row when a new entry point appears.
2. Append one changelog line. Do not edit older lines.
3. Do not regenerate, reorder, or restyle the rest of this file.

If the code and this file disagree, trust a fresh `get_code_snippet`, then fix the one wrong line.

## Changelog

- 2026-10-03 — Initial map: scopes, job statuses, worker chain, stop/lock/skip-existing invariants, OAuth non-interactive rule.
- 2026-10-03 — UI overhaul: `UploadDriveDrawer` thay `UploadDriveModal` (ẩn alert đăng nhập), `DriveJobLine` bottom bar trong `BottomPlayer`, `DriveDetailDrawer` đọc `file_results` per-file (cột mới `drive_upload_jobs.file_results`), preview trả thêm `folder_id`/`existingNames`.
- 2026-10-03 — `DriveService` export thêm `getOnDriveChapterNumbers` (drive_check cache TTL 30s); `ChaptersService.findByNovel` hỗ trợ filter `onDrive` cho UI cột Drive + pill Drive.