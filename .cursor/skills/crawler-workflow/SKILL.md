---
name: crawler-workflow
description: >-
  Map of the novel crawl workflow across the React UI, NestJS API, and Python
  worker. Use when changing crawl jobs, chapter extraction, Playwright
  navigation, anti-bot or captcha recovery, pause, resume, retry, cancel, or
  crawl job status. Read this before opening crawl files.
---

# Crawl workflow

Project graph: `C-Users-ASUS-Desktop-workspace-project-novel-crawler`.

Use this map, then `search_graph` / `get_code_snippet` for the one symbol you will change. Do not open `worker/crawler.py` from the top.

## Flow

1. UI: `frontend/src/features/crawl/` — `CrawlPage`, `crawlApi`, `useCrawlQueries`.
2. API: `CrawlController` → `CrawlService` (`backend/src/crawl/`).
3. Process: `CrawlWorkerService` starts `worker/crawl_worker.py`, which runs `worker/crawl_job_runner.py`.
4. Extract: `crawl_novel` → `_crawl_novel` in `worker/crawler.py`.
5. Job rows: `worker/crawl_jobs.py`. Chapter text: `worker/db.py` (`upsert_chapter`).

`crawl_novel(..., run_tts=True)` can continue into TTS. TTS rules live in the `tts-workflow` skill.

## Contract

- Scopes: `missing`, `failed`, `chapters` (`CRAWL_SCOPES`).
- Job statuses: `pending`, `running`, `paused`, `waiting_for_manual_action`, `completed`, `completed_with_errors`, `failed`, `cancelled`.
- Active jobs: `pending`, `running`, `paused`, `waiting_for_manual_action` (`CRAWL_ACTIVE_STATUSES`).
- One active crawl at a time. Respect `crawl_worker.lock` and `crawl_runner.pid`.
- Store extracted chapter text as read. Do not rewrite, summarize, or invent chapter content.
- Forbidden, captcha, and temporary server errors recover or wait inside `worker/crawler.py`. Do not drop those paths when adding a feature.
- `browser_state.json` is gitignored session state. Do not commit it or print cookies.

API surface on `CrawlController`: `lookup`, `current`, `list`, `create`, `getOne`, `chapters`, `pause`, `resume`, `continueManual`, `cancel`, `retry`.

## Where to look

| Change | Start here |
| --- | --- |
| Job create, pause, resume, cancel, retry | `CrawlService` in `backend/src/crawl/crawl.service.ts` |
| Launch or stop the worker | `CrawlWorkerService`, `worker/crawl_worker.py` |
| Per-job chapter plan and status | `replace_plan`, `set_chapter`, `claim_job` in `worker/crawl_jobs.py` |
| Page navigation, forbidden, captcha | `_goto_chapter`, `_recover_from_forbidden`, `_wait_for_content_with_captcha` |
| Chapter list or body selectors | `_get_chapter_list`, `_extract_chapter_content` |
| URL normalization | `backend/src/crawl/novel-url.ts` and `_normalize_novel_url` |

Tests matching `*.spec.ts` are excluded from the graph. Read those files directly when the change needs a test.

## Maintaining this skill

After changing crawl code in this session, patch this file only when the change makes a fact here false or incomplete. That means a new or removed entry point, status, scope, invariant, or cross-layer contract.

Leave this file unchanged for bugfixes that keep the same contract, private helper renames, formatting, comments, logs, UI copy, and reverted experiments.

When a patch is required:

1. Edit the single stale bullet, table row, or contract line. Add one row when a new entry point appears.
2. Append one changelog line. Do not edit older lines.
3. Do not regenerate, reorder, or restyle the rest of this file.

If the code and this file disagree, trust a fresh `get_code_snippet`, then fix the one wrong line.

## Changelog

- 2026-09-27 — Initial map: scopes, job statuses, worker chain, content invariant.
