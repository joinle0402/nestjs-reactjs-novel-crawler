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
3. Process: `TtsWorkerService` starts `worker/tts_worker.py`, which runs `worker/tts_job_runner.py`. Offline engines are served by a long-lived broker (`worker/tts_engine_server.py`) so the model is loaded once per session.
4. Audio: `generate_mp3_for_novel` in `worker/tts.py`.
5. Job rows: `worker/tts_jobs.py`. Chapter MP3 path: `worker/db.py`.

Crawl may call TTS when `run_tts=True`. Crawl job rules live in the `crawler-workflow` skill.

## Contract

- Scopes: `missing`, `failed`, `chapters` (`TTS_SCOPES`).
- Job statuses: `pending`, `running`, `stopped`, `completed`, `failed` (`TTS_JOB_STATUSES`).
- Engines: `edge-tts` (default), `vieneu`, and `zerotts` (`TTS_ENGINES`). Voice lists stay in `voicesForEngine` in `backend/src/tts/entities/tts-job.entity.ts`. Do not copy the voice list into this skill.
- Offline engines run in a detached, long-lived `worker/tts_engine_server.py`, discovered through `worker/.runtime/engine-<engine>.json` (pid/port/token/fingerprint) by `worker/engine_client.py`. The process is reused across jobs, previews and crawl, so a new job does not reload the model. `close_vieneu()` / `close_zerotts()` only drop in-flight sockets; they do not stop the engine. Idle shutdown follows `engineIdleMinutes` in `tts_settings.json` (0 = never, env `TTS_ENGINE_IDLE_MINUTES` wins); default 0. `worker/stop_engines.py` stops them manually. Engine code, env (`VIENEU_BACKEND`, model id, HF cache) or clone voices changing the fingerprint forces a reload.
- One active TTS worker at a time. Respect `tts_worker.lock`.
- Skip chapters that already have a valid MP3, and chapters with no content.
- `_normalize_tts_text` only strips tags, URLs, control characters, emoji, and known junk. Do not rewrite, summarize, or paraphrase the story.
- VieNeu packs sentences with quote-aware semantics: a sentence adjacent to quoted dialogue joins the chunk ignoring the sentence cap (char budget `VIENEU_CHUNK_*` stays the hard limit); `VIENEU_CHUNK_PAUSE_MS` (350) is inserted between chunks. `_prepare_vieneu_speech` only adjusts pauses and punctuation. Edge-TTS still uses `_split_text_into_chunks` and `TTS_CHUNK_SIZE`.
- Chunking needs ffmpeg. Without ffmpeg, still write the voice MP3. Mixing a library track at Drive upload also needs ffmpeg; if ffmpeg is missing that upload job fails and the voice file stays as it is.
- MP3 generation honours `bgmEnabled` (from `tts_settings.json`; job snapshots it in `bgm_enabled`). When on and ffmpeg + BGM path exist, `_tts_chapter` mixes the BGM into the chapter MP3 before loudness norm and marks the chapter `has_bgm`; mixing failure keeps the voice file and leaves the flag false. When off, the MP3 is voice only. The player also layers a track from `worker/bgm/` beside the voice; the selector under the bottom bar defaults to the first library track unless the listener turned background music off, and it offers an explicit "Không nhạc nền" option. Drive upload mixes the chosen track into a temp copy.
- Chapter carries `has_bgm` (`chapters.has_bgm`, API `hasBgm` on detail/list/neighbor) meaning the stored MP3 already has background music baked in. Player defaults BGM off for such chapters (per-track override, does not overwrite the listener's saved choice). TTS sets it from whether it mixed BGM; also settable via `set_chapter_has_bgm` in `worker/db.py` or `PUT /chapters/:id { hasBgm }`.
- Stopping or interrupting resets processing chapters so a later run can resume (`reset_processing_tts_chapters`).

API surface on `TtsController`: `getSettings`, `updateSettings`, `savedSample`, `sample`, `audioFile`, `preview`, `current`, `logs`, `start`, `stop`.

## Where to look

| Change | Start here |
| --- | --- |
| Start, stop, preview, progress | `TtsService` in `backend/src/tts/tts.service.ts` |
| Engine, voice, rate | `TtsSettingsService` and `worker` settings loader |
| Sample playback | `TtsSampleService`, `worker/tts_sample.py` |
| Launch or stop the worker | `TtsWorkerService`, `worker/tts_worker.py` |
| Which chapters get audio | `generate_mp3_for_novel` |
| Per-chapter synthesis and chunks | `_tts_chapter`, `_tts_chapter_content`; edge-tts `_split_text_into_chunks`; VieNeu `_split_vieneu_chunks` |
| VieNeu process | `worker/tts_vieneu.py` |
| ZeroTTS process | `worker/tts_zerotts.py` |
| Engine warm process, idle TTL, fingerprint | `worker/engine_client.py`, `worker/tts_engine_server.py`, `worker/stop_engines.py` |
| Chapter range parsing | `backend/src/tts/chapter-range.ts` and `worker/chapter_range.py` |
| Background music library | `backend/src/bgm/`, `worker/bgm_library.py`; playback in `AudioPlayerContext` |

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
- 2026-10-14 — Generation writes voice-only MP3. Library tracks play beside the voice; Drive mixes the selected track before upload.
- 2026-10-14 — Player BGM selector sits under the bottom bar and defaults to the first library track. `Just_Stay_Aakash_Gandhi.mp3` is imported into `worker/bgm/catalog.json` once.
- 2026-10-17 — Chapter `has_bgm` flag added (`chapters.has_bgm`, API `hasBgm`); player defaults BGM off for MP3s already mixed with music; BGM selector gains explicit "Không nhạc nền" option while default stays the first library track.
- 2026-10-17 — TTS generation mixes BGM into the chapter MP3 again when `bgmEnabled` is on (settings + per-job `bgm_enabled`) and sets `has_bgm` from the mix result; `bgmEnabled` toggle restored in TTS settings UI.
- 2026-10-17 — Added `zerotts` engine (ZeroTTS, ONNX CPU): own `.venv-zerotts` + `tts_zerotts.py` process, shares the VieNeu sentence chunking and `VIENEU_CHUNK_*`/pause invariants; rate % ignored like VieNeu.
- 2026-10-21 — Offline engines now live in a detached broker (`tts_engine_server.py`) reused across jobs/previews/crawl; added `engineIdleMinutes` setting (0 = never) and `worker/stop_engines.py`.
