---
name: tts-workflow
description: >-
  Map of the novel text-to-speech workflow across the React UI, NestJS API,
  and Python worker. Use when changing TTS jobs, MP3 generation, edge-tts,
  VieNeu, chapter chunking, background music, voice or rate settings, samples,
  or TTS resume and stop. Read this before opening TTS files.
---

# TTS workflow

Project graph: `C-Users-ASUS-Desktop-workspace-project-novel-crawler`.

Use this map, then `search_graph` / `get_code_snippet` for the one symbol you will change. Do not open `worker/tts.py` from the top.

## Flow

1. UI: `frontend/src/features/tts/` — `TtsSettingsPage`, `TtsRunModal`, `ttsApi`, `useTtsQueries`.
2. API: `TtsController` → `TtsService`, `TtsSettingsService`, `TtsSampleService` (`backend/src/tts/`).
3. Process: `TtsWorkerService` starts `worker/tts_worker.py`, which runs `worker/tts_job_runner.py`.
4. Audio: `generate_mp3_for_novel` in `worker/tts.py`.
5. Job rows: `worker/tts_jobs.py`. Chapter MP3 path: `worker/db.py`.

Crawl may call TTS when `run_tts=True`. Crawl job rules live in the `crawler-workflow` skill.

## Contract

- Scopes: `missing`, `failed`, `chapters` (`TTS_SCOPES`).
- Job statuses: `pending`, `running`, `stopped`, `completed`, `failed` (`TTS_JOB_STATUSES`).
- Engines: `edge-tts` (default) and `vieneu` (`TTS_ENGINES`). Voice lists stay in `voicesForEngine` in `backend/src/tts/entities/tts-job.entity.ts`. Do not copy the voice list into this skill.
- One active TTS worker at a time. Respect `tts_worker.lock`.
- Skip chapters that already have a valid MP3, and chapters with no content.
- `_normalize_tts_text` only strips tags, URLs, control characters, emoji, and known junk. Do not rewrite, summarize, or paraphrase the story.
- VieNeu packs sentences with quote-aware semantics: a sentence adjacent to quoted dialogue joins the chunk ignoring the sentence cap (char budget `VIENEU_CHUNK_*` stays the hard limit); `VIENEU_CHUNK_PAUSE_MS` (350) is inserted between chunks. `_prepare_vieneu_speech` only adjusts pauses and punctuation. Edge-TTS still uses `_split_text_into_chunks` and `TTS_CHUNK_SIZE`.
- Chunking and background music need ffmpeg. Without ffmpeg, still write the voice MP3.
- `use_bgm` passed into a job is a snapshot. Do not re-read `tts_settings.json` mid-job for that flag.
- Stopping or interrupting resets processing chapters so a later run can resume (`reset_processing_tts_chapters`).

API surface on `TtsController`: `getSettings`, `updateSettings`, `savedSample`, `sample`, `audioFile`, `preview`, `current`, `logs`, `start`, `stop`.

## Where to look

| Change | Start here |
| --- | --- |
| Start, stop, preview, progress | `TtsService` in `backend/src/tts/tts.service.ts` |
| Engine, voice, rate, BGM settings | `TtsSettingsService` and `worker` settings loader |
| Sample playback | `TtsSampleService`, `worker/tts_sample.py` |
| Launch or stop the worker | `TtsWorkerService`, `worker/tts_worker.py` |
| Which chapters get audio | `generate_mp3_for_novel` |
| Per-chapter synthesis and chunks | `_tts_chapter`, `_tts_chapter_content`; edge-tts `_split_text_into_chunks`; VieNeu `_split_vieneu_chunks` |
| VieNeu process | `worker/tts_vieneu.py` |
| Chapter range parsing | `backend/src/tts/chapter-range.ts` and `worker/chapter_range.py` |

Tests matching `*.spec.ts` are excluded from the graph. Read those files directly when the change needs a test.

## Maintaining this skill

After changing TTS code in this session, patch this file only when the change makes a fact here false or incomplete. That means a new or removed entry point, status, scope, engine, invariant, or cross-layer contract.

Leave this file unchanged for bugfixes that keep the same contract, private helper renames, formatting, comments, logs, UI copy, voice-label edits, and reverted experiments.

When a patch is required:

1. Edit the single stale bullet, table row, or contract line. Add one row when a new entry point appears.
2. Append one changelog line. Do not edit older lines.
3. Do not regenerate, reorder, or restyle the rest of this file.

If the code and this file disagree, trust a fresh `get_code_snippet`, then fix the one wrong line.

## Changelog

- 2026-09-27 — Initial map: scopes, engines, worker chain, normalize and resume invariants.
- 2026-09-27 — VieNeu sentence packing and pause gaps; edge-tts chunk size unchanged.
- 2026-10-01 — VieNeu runs `VIENEU_BACKEND=torch` via `worker/.env` (RTX GPU, ~8x onnx speed); torch backend needs `transformers` + CUDA torch wheel in `.venv-vieneu`.
- 2026-10-01 — VieNeu packing now quote-aware (dialogue glue drops the sentence cap, char budget governs); `VIENEU_CHUNK_PAUSE_MS` 250→350. Reference voice `hoaimy.wav` regenerated from edge-tts (26.9s sample).
