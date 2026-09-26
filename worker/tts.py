"""Chuyển nội dung chương thành MP3 (edge-tts hoặc VieNeu)."""

from __future__ import annotations

import asyncio
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Callable

import edge_tts

from tts_vieneu_client import close_vieneu, synthesize_vieneu
from config import (
    BGM_EXPORT_BITRATE,
    BGM_FADE_IN_MS,
    BGM_FADE_OUT_MS,
    BGM_LOOP,
    BGM_PATH,
    BGM_VOLUME_DB,
    ENABLE_TTS_CHUNK,
    MP3_OUTPUT_DIR,
    TTS_CHUNK_CONCURRENCY,
    TTS_CHUNK_SIZE,
    TTS_CONCURRENCY,
    TTS_MAX_RETRIES,
    TTS_RATE,
    TTS_REQUEST_DELAY_SEC,
    TTS_VOICE,
    SELECTORS,
)
from db import (
    Chapter,
    STATUS_FAILED,
    chapter_has_content,
    get_chapters_for_novel,
    get_chapters_without_mp3,
    increment_tts_chars_done,
    reset_processing_tts_chapters,
    sort_chapters_for_tts,
    start_tts_chapter,
    update_chapter_mp3,
    update_tts_status,
)

_ffmpeg_available: bool | None = None
_bgm_source = None
_bgm_source_path: Path | None = None
_bgm_missing_warned = False

_HTML_TAG_RE = re.compile(r"<[^>]+>")
_URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_ZERO_WIDTH_RE = re.compile(r"[\u200b-\u200f\u202a-\u202e\ufeff\u2060]")
_EMOJI_RE = re.compile(
    "["
    "\U0001F300-\U0001FAFF"
    "\U00002600-\U000027BF"
    "\U0001F1E6-\U0001F1FF"
    "\U0000FE00-\U0000FE0F"
    "]+"
)
_HAN_RE = re.compile(r"[\u4e00-\u9fff]")
_HAN_PUNCT = str.maketrans(
    {
        "。": ". ",
        "！": "! ",
        "？": "? ",
        "，": ", ",
        "、": ", ",
        "：": ": ",
        "；": "; ",
        "「": '"',
        "」": '"',
        "『": '"',
        "』": '"',
    }
)
_JUNK_PHRASES = (
    SELECTORS["placeholder_text"],
    SELECTORS["loading_text"],
)
_VIENEU_CUE_RE = re.compile(r"\[(?:cười|thở dài|hắng giọng)\]", re.IGNORECASE)


async def _run_blocking(func, *args):
    """Python 3.8 không có asyncio.to_thread."""
    to_thread = getattr(asyncio, "to_thread", None)
    if to_thread is not None:
        return await to_thread(func, *args)
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: func(*args))


def _normalize_tts_text(text: str) -> str:
    """Bỏ rác khiến edge-tts retry. Không viết lại câu chuyện."""
    if not text:
        return ""
    text = _HTML_TAG_RE.sub(" ", text)
    text = _URL_RE.sub(" ", text)
    text = text.translate(_HAN_PUNCT)
    text = _ZERO_WIDTH_RE.sub("", text)
    text = _CONTROL_RE.sub("", text)
    text = _EMOJI_RE.sub("", text)
    for phrase in _JUNK_PHRASES:
        text = re.sub(re.escape(phrase), "", text, flags=re.IGNORECASE)
    text = _VIENEU_CUE_RE.sub("", text)

    kept: list[str] = []
    for raw_line in text.splitlines():
        line = re.sub(r"[ \t]+", " ", raw_line).strip()
        if not line:
            kept.append("")
            continue
        han = len(_HAN_RE.findall(line))
        if han > 0 and han / len(line) >= 0.5:
            kept.append("")
            continue
        kept.append(line)

    text = "\n".join(kept)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


def _safe_filename(text: str, max_len: int = 80) -> str:
    cleaned = re.sub(r'[<>:"/\\|?*]', "", text).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:max_len] or "chapter"


def _progress_pct(current: int, total: int) -> int:
    if total <= 0:
        return 100
    return int(current * 100 / total)


def _split_text_into_chunks(text: str, max_size: int = TTS_CHUNK_SIZE) -> list[str]:
    """Chia text thành chunk, ưu tiên cắt theo đoạn văn / xuống dòng."""
    text = text.strip()
    if len(text) <= max_size:
        return [text]

    min_size = max(500, max_size // 2)
    chunks: list[str] = []
    remaining = text

    while remaining:
        if len(remaining) <= max_size:
            chunks.append(remaining)
            break

        window = remaining[:max_size]
        split_at = -1
        for sep in ("\n\n", "\n", "。", ". ", "! ", "? ", " "):
            pos = window.rfind(sep, min_size)
            if pos > 0:
                split_at = pos + len(sep)
                break

        if split_at <= 0:
            split_at = max_size

        chunk = remaining[:split_at].strip()
        if chunk:
            chunks.append(chunk)
        remaining = remaining[split_at:].strip()

    return chunks


async def _text_to_mp3(
    text: str,
    output_path: Path,
    *,
    engine: str = "edge-tts",
    voice: str = TTS_VOICE,
    rate: str = TTS_RATE,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if engine == "vieneu":
        await _run_blocking(synthesize_vieneu, text, output_path, voice)
        return
    communicate = edge_tts.Communicate(text, voice, rate=rate)
    await communicate.save(str(output_path))
    if TTS_REQUEST_DELAY_SEC > 0:
        await asyncio.sleep(TTS_REQUEST_DELAY_SEC)


async def _text_to_mp3_with_retry(
    text: str,
    output_path: Path,
    *,
    engine: str = "edge-tts",
    voice: str = TTS_VOICE,
    rate: str = TTS_RATE,
) -> None:
    last_exc: Exception | None = None
    for attempt in range(TTS_MAX_RETRIES):
        try:
            await _text_to_mp3(text, output_path, engine=engine, voice=voice, rate=rate)
            return
        except Exception as exc:
            last_exc = exc
            if attempt < TTS_MAX_RETRIES - 1:
                wait = 2 ** (attempt + 1)
                print(
                    f"    TTS lỗi (lần {attempt + 1}): {type(exc).__name__} — "
                    f"thử lại sau {wait}s..."
                )
                await asyncio.sleep(wait)
    raise last_exc  # type: ignore[misc]


def _ffmpeg_on_path() -> bool:
    """True khi ffmpeg chạy được. which() thôi chưa đủ: alias Windows vẫn ném WinError 2."""
    global _ffmpeg_available
    if _ffmpeg_available is not None:
        return _ffmpeg_available
    exe = shutil.which("ffmpeg")
    if not exe:
        _ffmpeg_available = False
        return False
    try:
        subprocess.run(
            [exe, "-version"],
            capture_output=True,
            timeout=5,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        _ffmpeg_available = False
        return False
    _ffmpeg_available = True
    return True


def _bgm_enabled() -> bool:
    global _bgm_missing_warned
    if not BGM_PATH:
        return False
    path = Path(BGM_PATH)
    if path.is_file():
        return True
    if not _bgm_missing_warned:
        print(f"Lưu ý: BGM_PATH không tồn tại ({BGM_PATH}) — bỏ qua nhạc nền.")
        _bgm_missing_warned = True
    return False


def _load_bgm_source():
    global _bgm_source, _bgm_source_path
    from pydub import AudioSegment

    path = Path(BGM_PATH).resolve()
    if _bgm_source is None or _bgm_source_path != path:
        _bgm_source = AudioSegment.from_file(str(path))
        _bgm_source_path = path
    return _bgm_source


def _prepare_bgm_for_voice(voice):
    from pydub import AudioSegment

    bgm = _load_bgm_source()
    bgm = bgm.set_frame_rate(voice.frame_rate).set_channels(voice.channels)
    bgm = bgm + BGM_VOLUME_DB

    if len(bgm) < len(voice):
        if BGM_LOOP:
            loops = (len(voice) // len(bgm)) + 1
            bgm = bgm * loops
        else:
            silence = AudioSegment.silent(
                duration=len(voice) - len(bgm),
                frame_rate=voice.frame_rate,
            )
            bgm = bgm + silence
    bgm = bgm[: len(voice)]

    fade_in = min(BGM_FADE_IN_MS, len(bgm))
    fade_out = min(BGM_FADE_OUT_MS, len(bgm))
    if fade_in > 0:
        bgm = bgm.fade_in(fade_in)
    if fade_out > 0:
        bgm = bgm.fade_out(fade_out)
    return bgm


def _mix_background_music_or_skip(voice_path: Path, *, quiet: bool = False) -> None:
    """Trộn nhạc nền nếu ffmpeg chạy được. Lỗi nhạc nền không được hủy file giọng."""
    if not _ffmpeg_on_path():
        if not quiet:
            print(
                "Lưu ý: không có ffmpeg — bỏ nhạc nền, giữ file giọng đọc. "
                "Cài ffmpeg (winget install Gyan.FFmpeg) rồi chạy lại nếu cần nhạc nền.",
                flush=True,
            )
        return
    try:
        _mix_background_music(voice_path)
    except Exception as exc:
        if not quiet:
            print(
                f"Lưu ý: không trộn được nhạc nền ({exc}) — giữ file giọng đọc.",
                flush=True,
            )


def _mix_background_music(voice_path: Path) -> None:
    """Trộn nhạc nền vào file giọng đọc (ghi đè cùng path)."""
    from pydub import AudioSegment

    voice = AudioSegment.from_mp3(str(voice_path))
    bgm = _prepare_bgm_for_voice(voice)
    mixed = voice.overlay(bgm)
    mixed.export(
        str(voice_path),
        format="mp3",
        bitrate=BGM_EXPORT_BITRATE,
    )


def _merge_mp3_files(chunk_paths: list[Path], output_path: Path) -> None:
    """Ghép các chunk MP3 — ưu tiên pydub+ffmpeg, fallback nối byte."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if _ffmpeg_on_path():
        try:
            from pydub import AudioSegment

            combined = AudioSegment.empty()
            for path in chunk_paths:
                combined += AudioSegment.from_mp3(str(path))
            combined.export(str(output_path), format="mp3")
            return
        except Exception as exc:
            print(f"Ghép MP3 bằng ffmpeg lỗi ({exc}) — nối byte.", flush=True)

    with open(output_path, "wb") as out:
        for path in chunk_paths:
            out.write(path.read_bytes())


def _log_tts_progress(
    chapter_number: int,
    title: str,
    done: int,
    total: int,
    *,
    quiet: bool = False,
) -> None:
    if quiet:
        return
    pct = _progress_pct(done, total)
    print(
        f"[TTS] Ch.{chapter_number:04d} {title[:40]} — "
        f"{done:,}/{total:,} ký tự ({pct}%)",
        flush=True,
    )


async def _tts_single_chunk(
    text: str,
    output_path: Path,
    chunk_sem: asyncio.Semaphore,
    *,
    engine: str,
    voice: str,
    rate: str,
    on_chunk_done: Callable[[int], None] | None = None,
) -> None:
    async with chunk_sem:
        await _text_to_mp3_with_retry(text, output_path, engine=engine, voice=voice, rate=rate)
        if on_chunk_done:
            on_chunk_done(len(text))


async def _tts_chapter_content(
    ch: Chapter,
    content: str,
    output_path: Path,
    chunk_sem: asyncio.Semaphore,
    *,
    engine: str,
    voice: str,
    rate: str,
    quiet: bool = False,
) -> None:
    """TTS nội dung chương — 1 request hoặc chunk + merge."""
    content = _normalize_tts_text(content)
    if not content:
        raise ValueError("Nội dung chương rỗng sau khi chuẩn hóa")
    chars_total = len(content)
    start_tts_chapter(ch.id, chars_total)

    def _on_chunk_done(delta: int) -> None:
        done, total = increment_tts_chars_done(ch.id, delta)
        _log_tts_progress(ch.chapter_number, ch.title, done, total, quiet=quiet)

    if not ENABLE_TTS_CHUNK or chars_total <= TTS_CHUNK_SIZE:
        await _text_to_mp3_with_retry(content, output_path, engine=engine, voice=voice, rate=rate)
        increment_tts_chars_done(ch.id, chars_total)
        _log_tts_progress(ch.chapter_number, ch.title, chars_total, chars_total, quiet=quiet)
        return

    chunks = _split_text_into_chunks(content)
    if len(chunks) == 1:
        await _text_to_mp3_with_retry(content, output_path, engine=engine, voice=voice, rate=rate)
        increment_tts_chars_done(ch.id, chars_total)
        _log_tts_progress(ch.chapter_number, ch.title, chars_total, chars_total, quiet=quiet)
        return

    with tempfile.TemporaryDirectory(prefix="tts_chunk_") as tmp_dir:
        tmp = Path(tmp_dir)
        chunk_paths: list[Path] = []
        tasks = []
        for i, chunk_text in enumerate(chunks):
            chunk_path = tmp / f"chunk_{i:03d}.mp3"
            chunk_paths.append(chunk_path)
            tasks.append(
                _tts_single_chunk(
                    chunk_text,
                    chunk_path,
                    chunk_sem,
                    engine=engine,
                    voice=voice,
                    rate=rate,
                    on_chunk_done=_on_chunk_done,
                )
            )

        await asyncio.gather(*tasks)
        _merge_mp3_files(chunk_paths, output_path)


async def _tts_chapter(
    ch: Chapter,
    output_path: Path,
    idx: int,
    total: int,
    chapter_sem: asyncio.Semaphore,
    chunk_sem: asyncio.Semaphore,
    *,
    engine: str,
    voice: str,
    rate: str,
    use_bgm: bool,
    quiet: bool = False,
) -> Path:
    async with chapter_sem:
        if not quiet:
            pct = _progress_pct(idx, total)
            print(f"  [{idx}/{total}] ({pct}%) TTS: {ch.title}", flush=True)
        try:
            await _tts_chapter_content(
                ch,
                ch.content,
                output_path,
                chunk_sem,
                engine=engine,
                voice=voice,
                rate=rate,
                quiet=quiet,
            )
            if use_bgm:
                _mix_background_music_or_skip(output_path, quiet=quiet)
            if not output_path.is_file() or output_path.stat().st_size <= 0:
                raise RuntimeError(f"Không tạo được file MP3: {output_path}")
            update_chapter_mp3(ch.id, str(output_path))
            return output_path
        except Exception as exc:
            update_tts_status(ch.id, STATUS_FAILED)
            if not quiet:
                print(f"[TTS Lỗi] Ch.{ch.chapter_number} ({ch.title}): {exc}", flush=True)
            raise


async def _generate_all_mp3(
    chapters: list[Chapter],
    novel_dir: Path,
    *,
    engine: str,
    voice: str,
    rate: str,
    use_bgm: bool,
    quiet: bool = False,
) -> tuple[list[Path], list[Chapter]]:
    chapter_sem = asyncio.Semaphore(TTS_CONCURRENCY)
    chunk_sem = asyncio.Semaphore(TTS_CHUNK_CONCURRENCY)
    total = len(chapters)
    tasks = []
    for idx, ch in enumerate(chapters, start=1):
        filename = f"{ch.chapter_number:04d}_{_safe_filename(ch.title)}.mp3"
        output_path = novel_dir / filename
        tasks.append(
            _tts_chapter(
                ch,
                output_path,
                idx,
                total,
                chapter_sem,
                chunk_sem,
                engine=engine,
                voice=voice,
                rate=rate,
                use_bgm=use_bgm,
                quiet=quiet,
            )
        )

    results = await asyncio.gather(*tasks, return_exceptions=True)

    success: list[Path] = []
    failed: list[Chapter] = []
    for ch, result in zip(chapters, results):
        if isinstance(result, Exception):
            if not quiet:
                print(f"  Lỗi TTS: {ch.title} — {result}")
            failed.append(ch)
        else:
            success.append(result)

    return success, failed


def synthesize_clip(
    text: str,
    output_path: Path,
    *,
    engine: str,
    voice: str,
    rate: str,
) -> None:
    """Một đoạn ngắn, không nhạc nền. Dùng cho nút nghe thử trên trang cài đặt."""
    normalized = _normalize_tts_text(text)
    if not normalized:
        raise ValueError("Văn bản thử giọng rỗng sau khi chuẩn hóa")
    asyncio.run(_text_to_mp3(normalized, output_path, engine=engine, voice=voice, rate=rate))


def chapter_to_mp3(text: str, output_path: Path) -> None:
    from config import load_tts_settings

    settings = load_tts_settings()
    text = _normalize_tts_text(text)
    if not text:
        raise ValueError("Nội dung chương rỗng sau khi chuẩn hóa")
    asyncio.run(
        _text_to_mp3_with_retry(
            text,
            output_path,
            engine=str(settings["engine"]),
            voice=str(settings["voice"]),
            rate=str(settings["rate"]),
        )
    )
    if settings["bgmEnabled"] and _bgm_enabled():
        _mix_background_music_or_skip(output_path)


def generate_mp3_for_novel(
    novel_id: int,
    novel_title: str,
    chapter_numbers: frozenset[int] | None = None,
    voice: str | None = None,
    rate: str | None = None,
    *,
    engine: str | None = None,
    quiet: bool = False,
    use_bgm: bool | None = None,
) -> list[Path]:
    """Tạo 1 file MP3 cho mỗi chương chưa có audio hợp lệ (song song).

    use_bgm=None đọc bật/tắt từ tts_settings.json lúc bắt đầu.
    Truyền True/False để khóa snapshot của một job, không đọc lại giữa chừng.
    """
    from config import load_tts_settings

    settings = load_tts_settings()
    engine = engine or str(settings["engine"])
    voice = voice or str(settings["voice"])
    rate = rate or str(settings["rate"])
    if use_bgm is None:
        use_bgm = bool(settings["bgmEnabled"])

    all_chapters = get_chapters_for_novel(novel_id)
    need_mp3 = get_chapters_without_mp3(novel_id)

    if chapter_numbers is not None:
        need_mp3 = [ch for ch in need_mp3 if ch.chapter_number in chapter_numbers]

    empty_skipped: list[Chapter] = []
    chapters: list[Chapter] = []
    for ch in need_mp3:
        if not chapter_has_content(ch.content):
            empty_skipped.append(ch)
            continue
        chapters.append(ch)

    chapters = sort_chapters_for_tts(chapters)

    already_have = len(all_chapters) - len(need_mp3)
    if already_have > 0 and not quiet:
        print(f"Bỏ qua {already_have} chương đã có MP3 hợp lệ.")

    if not chapters:
        if not quiet:
            print("Không có chương nào cần tạo MP3.")
        return []

    if ENABLE_TTS_CHUNK and not _ffmpeg_on_path() and not quiet:
        print(
            "Lưu ý: chưa cài ffmpeg — ghép chunk MP3 bằng nối byte "
            "(vẫn nghe được, chất lượng tương đương)."
        )
    mix_bgm = bool(use_bgm) and _bgm_enabled() and _ffmpeg_on_path()
    if use_bgm and _bgm_enabled() and not mix_bgm and not quiet:
        print(
            "Lưu ý: không có ffmpeg — bỏ nhạc nền, vẫn tạo MP3 giọng đọc. "
            "Cài ffmpeg: winget install Gyan.FFmpeg"
        )
    if mix_bgm and not quiet:
        print(f"Nhạc nền: {BGM_PATH} ({BGM_VOLUME_DB} dB, loop={BGM_LOOP})")

    chunk_info = ""
    if ENABLE_TTS_CHUNK:
        chunk_info = f", chunk concurrency={TTS_CHUNK_CONCURRENCY}"
    if not quiet:
        if engine == "vieneu":
            print(f"Tạo MP3 cho {len(chapters)} chương (VieNeu, voice={voice}{chunk_info})...")
        else:
            print(
                f"Tạo MP3 cho {len(chapters)} chương "
                f"(song song, tối đa {TTS_CONCURRENCY}{chunk_info}, voice={voice}, rate={rate})..."
            )

    novel_dir = Path(MP3_OUTPUT_DIR) / _safe_filename(novel_title)
    try:
        success, failed = asyncio.run(
            _generate_all_mp3(
                chapters,
                novel_dir,
                engine=engine,
                voice=voice,
                rate=rate,
                use_bgm=mix_bgm,
                quiet=quiet,
            )
        )
    except KeyboardInterrupt:
        close_vieneu()
        reset_processing_tts_chapters(novel_id)
        if not quiet:
            print(
                "\n[TTS] Đã dừng. Chạy lại để resume các chương chưa hoàn thành.",
                flush=True,
            )
        return []

    if not quiet:
        print(
            f"\nTổng kết TTS: {len(success)} thành công, "
            f"{len(empty_skipped)} bỏ qua (rỗng), {len(failed)} lỗi"
        )
        if failed:
            print("Chương lỗi:")
            for ch in failed:
                print(f"  - [{ch.chapter_number}] {ch.title}")

    return success
