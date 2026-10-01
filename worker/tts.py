"""Chuyển nội dung chương thành MP3 (edge-tts hoặc VieNeu)."""

from __future__ import annotations

import asyncio
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Callable

import edge_tts

from tts_vieneu_client import close_vieneu, synthesize_vieneu
from log_utils import format_duration, format_elapsed, log_message
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
    VIENEU_CHUNK_MAX_CHARS,
    VIENEU_CHUNK_MAX_SENTENCES,
    VIENEU_CHUNK_PAUSE_MS,
    VIENEU_CHUNK_SHORT_CHARS,
    VIENEU_CHUNK_SHORT_MAX_CHARS,
    VIENEU_CHUNK_SHORT_MAX_SENTENCES,
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


_VIENEU_CLOSERS = set("\"“”‘’'»)\]】』」")
_VIENEU_QUOTES = "\"“”«»"


def _has_vieneu_quote(sentence: str) -> bool:
    """True khi câu chứa dấu ngoặc kép thoại (câu nhân vật nói)."""
    return any(ch in _VIENEU_QUOTES for ch in sentence)
_VIENEU_ABBREV_DOT = re.compile(
    r"(?:^|[\s(])(?:v\.v\.?|TS|PGS|GS|ThS|Mr|Mrs|Ms|Dr|St|No|tp)\.$",
    re.IGNORECASE,
)


def _prepare_vieneu_speech(text: str) -> str:
    """Chỉnh dấu ngắt để VieNeu nghỉ đúng chỗ. Không đổi từ của truyện."""
    if not text:
        return ""
    text = re.sub(r"\.{3,}|…+", "…", text)
    text = re.sub(r"(?<=\w)[^\S\n]*(?:—|–|--)[^\S\n]*(?=\w)", "… ", text)
    text = re.sub(r"(?m)^[^\S\n]*(?:—|–|--)[^\S\n]+", "", text)

    def _insert_speech_space(match: re.Match) -> str:
        punct, closers, nxt = match.group(1), match.group(2), match.group(3)
        # Dấu chấm trong v.v. / viết tắt viết thường không phải hết câu.
        if punct == "." and not nxt.isupper():
            return match.group(0)
        return punct + closers + " " + nxt

    text = re.sub(
        r"([.!?…])([\"“”‘’'»)\]】]*)([^\W\d_])",
        _insert_speech_space,
        text,
    )
    text = re.sub(r"[^\S\n]{2,}", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _consume_vieneu_closers(text: str, index: int) -> int:
    while index < len(text) and text[index] in _VIENEU_CLOSERS:
        index += 1
    return index


def _is_decimal_dot(text: str, index: int) -> bool:
    return (
        text[index] == "."
        and index > 0
        and text[index - 1].isdigit()
        and index + 1 < len(text)
        and text[index + 1].isdigit()
    )


def _is_abbrev_dot(text: str, index: int) -> bool:
    if text[index] != ".":
        return False
    if index > 0 and text[index - 1] in "vV":
        tail = text[index - 1 : index + 4]
        if re.match(r"v\.v\.?", tail, re.IGNORECASE):
            return True
    window = text[max(0, index - 16) : index + 1]
    return _VIENEU_ABBREV_DOT.search(window) is not None


def _split_vieneu_sentences(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    sentences: list[str] = []
    start = 0
    index = 0
    length = len(text)
    while index < length:
        if text[index] == "…" or text.startswith("...", index):
            end = index + (3 if text.startswith("...", index) else 1)
            while end < length and text[end] in ".…":
                end += 1
            end = _consume_vieneu_closers(text, end)
            if end >= length or text[end].isspace():
                piece = text[start:end].strip()
                if piece:
                    sentences.append(piece)
                index = end
                while index < length and text[index].isspace():
                    index += 1
                start = index
                continue
        if text[index] in ".!?":
            if _is_decimal_dot(text, index) or _is_abbrev_dot(text, index):
                index += 1
                continue
            end = index + 1
            while end < length and text[end] in ".!?":
                end += 1
            end = _consume_vieneu_closers(text, end)
            if end >= length or text[end].isspace():
                piece = text[start:end].strip()
                if piece:
                    sentences.append(piece)
                index = end
                while index < length and text[index].isspace():
                    index += 1
                start = index
                continue
        index += 1
    tail = text[start:].strip()
    if tail:
        sentences.append(tail)
    return sentences


def _split_overflow_sentence(sentence: str) -> list[str]:
    """Câu dài hơn ngân sách thì cắt ở dấu phẩy, không cắt giữa từ."""
    sentence = sentence.strip()
    if len(sentence) <= VIENEU_CHUNK_MAX_CHARS:
        return [sentence] if sentence else []
    parts: list[str] = []
    remaining = sentence
    while len(remaining) > VIENEU_CHUNK_MAX_CHARS:
        window = remaining[:VIENEU_CHUNK_MAX_CHARS]
        split_at = -1
        for sep in (", ", "; ", " "):
            pos = window.rfind(sep, VIENEU_CHUNK_MAX_CHARS // 2)
            if pos > 0:
                split_at = pos + len(sep)
                break
        if split_at <= 0:
            split_at = window.rfind(" ")
            split_at = split_at + 1 if split_at > 0 else VIENEU_CHUNK_MAX_CHARS
        piece = remaining[:split_at].strip()
        if piece:
            parts.append(piece)
        remaining = remaining[split_at:].strip()
    if remaining:
        parts.append(remaining)
    return parts


def _pack_vieneu_sentences(sentences: list[str]) -> list[str]:
    """Gói câu theo ngữ nghĩa: câu thoại (có ngoặc kép) dính câu kể dẫn/nối.

    Trần ký tự luôn là giới hạn cứng. Khi câu hiện tại hoặc câu trước đó là
    câu thoại thì bỏ trần số câu (chỉ còn trần ký tự), để cụm dẫn + thoại +
    nối — kể cả hội thoại liên hoàn — nằm trọn trong một infer.
    """
    chunks: list[str] = []
    buf: list[str] = []

    def flush() -> None:
        if buf:
            chunks.append(" ".join(buf))
            buf.clear()

    for sentence in sentences:
        for piece in _split_overflow_sentence(sentence):
            if not buf:
                buf.append(piece)
                continue
            short = len(piece) <= VIENEU_CHUNK_SHORT_CHARS and all(
                len(item) <= VIENEU_CHUNK_SHORT_CHARS for item in buf
            )
            max_sentences = (
                VIENEU_CHUNK_SHORT_MAX_SENTENCES if short else VIENEU_CHUNK_MAX_SENTENCES
            )
            max_chars = VIENEU_CHUNK_SHORT_MAX_CHARS if short else VIENEU_CHUNK_MAX_CHARS
            joined_len = len(" ".join(buf)) + 1 + len(piece)
            # Keo ngữ nghĩa: câu nói nối với câu dẫn/nối liền kề — bỏ trần số câu.
            if _has_vieneu_quote(piece) or _has_vieneu_quote(buf[-1]):
                if joined_len > max_chars:
                    flush()
            elif len(buf) >= max_sentences or joined_len > max_chars:
                flush()
            buf.append(piece)
    flush()
    return chunks


def _split_vieneu_chunks(text: str) -> list[str]:
    """Gói theo ngữ nghĩa: thoại dính câu dẫn/nối, mỗi infer còn nhịp đọc."""
    chunks: list[str] = []
    for paragraph in re.split(r"\n\s*\n", text):
        sentences: list[str] = []
        for line in paragraph.splitlines():
            line = line.strip()
            if line:
                sentences.extend(_split_vieneu_sentences(line))
        chunks.extend(_pack_vieneu_sentences(sentences))
    return [chunk for chunk in chunks if chunk.strip()]


async def _write_vieneu_chunks(
    chunks: list[str],
    output_path: Path,
    chunk_sem: asyncio.Semaphore,
    *,
    voice: str,
    rate: str,
    on_chunk_done: Callable[[int], None] | None = None,
) -> None:
    if not chunks:
        raise ValueError("Không có đoạn nào để đọc")
    if len(chunks) == 1:
        await _text_to_mp3_with_retry(
            chunks[0], output_path, engine="vieneu", voice=voice, rate=rate
        )
        if on_chunk_done:
            on_chunk_done(len(chunks[0]))
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
                    engine="vieneu",
                    voice=voice,
                    rate=rate,
                    on_chunk_done=on_chunk_done,
                )
            )
        await asyncio.gather(*tasks)
        _merge_mp3_files(chunk_paths, output_path, gap_ms=VIENEU_CHUNK_PAUSE_MS)


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
                log_message(
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
        log_message(f"Lưu ý: BGM_PATH không tồn tại ({BGM_PATH}) — bỏ qua nhạc nền.")
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


def _apply_loudness_norm(path: Path) -> None:
    """Chuẩn hóa âm lượng chapter theo EBU R128 (podcast/audiobook) — ghi đè cùng path.

    Lỗi chuẩn hóa không được hủy chapter: giữ file gốc nếu ffmpeg/filter lỗi.
    """
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return
    tmp = path.with_suffix(".loudnorm.mp3")
    try:
        result = subprocess.run(
            [
                ffmpeg,
                "-y",
                "-v",
                "error",
                "-i",
                str(path),
                "-af",
                "loudnorm=I=-16:TP=-1.5:LRA=11",
                "-c:a",
                "libmp3lame",
                "-b:a",
                "192k",
                str(tmp),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode == 0 and tmp.is_file() and tmp.stat().st_size > 0:
            tmp.replace(path)
        else:
            tmp.unlink(missing_ok=True)
            tail = (result.stderr or "").strip()[-300:]
            log_message(f"Lưu ý: không chuẩn hóa âm lượng ({tail or 'không rõ lỗi'}) — giữ file gốc.")
    except Exception as exc:
        tmp.unlink(missing_ok=True)
        log_message(f"Lưu ý: không chuẩn hóa âm lượng ({exc}) — giữ file gốc.")


def _mix_background_music_or_skip(voice_path: Path, *, quiet: bool = False) -> None:
    """Trộn nhạc nền nếu ffmpeg chạy được. Lỗi nhạc nền không được hủy file giọng."""
    if not _ffmpeg_on_path():
        if not quiet:
            log_message(
                "Lưu ý: không có ffmpeg — bỏ nhạc nền, giữ file giọng đọc. "
                "Cài ffmpeg (winget install Gyan.FFmpeg) rồi chạy lại nếu cần nhạc nền.",
            )
        return
    try:
        _mix_background_music(voice_path)
    except Exception as exc:
        if not quiet:
            log_message(
                f"Lưu ý: không trộn được nhạc nền ({exc}) — giữ file giọng đọc.",
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


def _room_tone_gap(duration_ms: int, *, frame_rate: int, channels: int) -> AudioSegment | None:
    """Khoảng nghỉ có noise floor rất nhỏ (~-58 dBFS) thay im lặng kỹ thuật số.

    Im lặng tuyệt đối nghe "khô" giữa hai câu; room tone nhẹ giữ cảm giác
    không gian liên tục. Trả None nếu tạo không được (dùng silent thay thế).
    """
    try:
        import array
        import random

        from pydub import AudioSegment

        if channels < 1 or channels > 2:
            return None
        sample_width = 2  # s16; chunk mp3 decode ra luôn là 16-bit
        samples = int(frame_rate * duration_ms / 1000) * channels
        amp = 42  # 16-bit full scale 32767 → ~-58 dBFS
        buf = array.array("h", bytes(sample_width * samples))
        for i in range(samples):
            buf[i] = random.randint(-amp, amp)
        seg = AudioSegment(
            data=buf.tobytes(),
            sample_width=sample_width,
            frame_rate=frame_rate,
            channels=channels,
        )
        return seg.fade_in(10).fade_out(10)
    except Exception as exc:
        log_message(f"Lưu ý: không tạo room tone ({exc}) — dùng im lặng thường.")
        return None


def _merge_mp3_files(
    chunk_paths: list[Path],
    output_path: Path,
    gap_ms: int = 0,
) -> None:
    """Ghép các chunk MP3 — ưu tiên pydub+ffmpeg, fallback nối byte."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if _ffmpeg_on_path():
        try:
            from pydub import AudioSegment

            combined = AudioSegment.empty()
            gap: AudioSegment | None = None
            for path in chunk_paths:
                seg = AudioSegment.from_mp3(str(path))
                if gap_ms > 0 and gap is None:
                    # Khoảng nghỉ khớp định dạng chunk đầu tiên; room tone
                    # thay im lặng kỹ thuật số để nhịp nghỉ không bị "khô".
                    gap = _room_tone_gap(
                        gap_ms,
                        frame_rate=seg.frame_rate,
                        channels=seg.channels,
                    ) or AudioSegment.silent(duration=gap_ms, frame_rate=seg.frame_rate)
                if len(combined) > 0 and gap is not None:
                    combined += gap
                # Fade 2 đầu mỗi chunk để mối nối không phát tiếng "cạch"
                # do biên độ không về 0 tại biên file.
                seg = seg.fade_in(15).fade_out(25)
                combined += seg
            combined.export(str(output_path), format="mp3", bitrate="192k")
            return
        except Exception as exc:
            log_message(f"Ghép MP3 bằng ffmpeg lỗi ({exc}) — nối byte.")

    with open(output_path, "wb") as out:
        for path in chunk_paths:
            out.write(path.read_bytes())


class _TtsProgressTimer:
    def __init__(self, chapter_number: int, title: str) -> None:
        self.chapter_number = chapter_number
        self.title = title
        self.started_at = time.perf_counter()
        self.last_logged_at = self.started_at
        self.last_done = 0

    def report(self, done: int, total: int, *, quiet: bool = False) -> None:
        now = time.perf_counter()
        delta = max(0, done - self.last_done)
        execute_seconds = max(0.0, now - self.last_logged_at)
        total_seconds = max(0.0, now - self.started_at)
        self.last_done = done
        self.last_logged_at = now
        _log_tts_progress(
            self.chapter_number,
            self.title,
            done,
            total,
            delta=delta,
            execute_seconds=execute_seconds,
            total_seconds=total_seconds,
            quiet=quiet,
        )


def _log_tts_progress(
    chapter_number: int,
    title: str,
    done: int,
    total: int,
    *,
    delta: int | None = None,
    execute_seconds: float | None = None,
    total_seconds: float | None = None,
    quiet: bool = False,
) -> None:
    if quiet:
        return
    pct = _progress_pct(done, total)
    total_text = f"{total:,}"
    number_width = len(total_text)
    done_text = f"{done:,}".rjust(number_width)
    timing = ""
    if delta is not None and execute_seconds is not None and total_seconds is not None:
        delta_text = f"{delta:,}".rjust(number_width)
        timing = (
            f" | xử lý thêm: {delta_text} ký tự"
            f" | thời gian đoạn: {format_elapsed(execute_seconds):>9}"
            f" | tổng thời gian: {format_elapsed(total_seconds):>9}"
            f" ({format_duration(total_seconds)})"
        )
    title_text = title[:40].ljust(40)
    log_message(
        f"[TTS] Ch.{chapter_number:04d} {title_text} — "
        f"{done_text}/{total_text} ký tự ({pct:>3}%){timing}",
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
    if engine == "vieneu":
        content = _prepare_vieneu_speech(content)
        if not content:
            raise ValueError("Nội dung chương rỗng sau khi chuẩn hóa")
        chunks = _split_vieneu_chunks(content)
        if not chunks:
            raise ValueError("Nội dung chương rỗng sau khi chia câu")
        chars_total = sum(len(chunk) for chunk in chunks)
        start_tts_chapter(ch.id, chars_total)
        progress_timer = _TtsProgressTimer(ch.chapter_number, ch.title)

        def _on_vieneu_chunk_done(delta: int) -> None:
            done, total = increment_tts_chars_done(ch.id, delta)
            progress_timer.report(done, total, quiet=quiet)

        await _write_vieneu_chunks(
            chunks,
            output_path,
            chunk_sem,
            voice=voice,
            rate=rate,
            on_chunk_done=_on_vieneu_chunk_done,
        )
        return

    chars_total = len(content)
    start_tts_chapter(ch.id, chars_total)
    progress_timer = _TtsProgressTimer(ch.chapter_number, ch.title)

    def _on_chunk_done(delta: int) -> None:
        done, total = increment_tts_chars_done(ch.id, delta)
        progress_timer.report(done, total, quiet=quiet)

    if not ENABLE_TTS_CHUNK or chars_total <= TTS_CHUNK_SIZE:
        await _text_to_mp3_with_retry(content, output_path, engine=engine, voice=voice, rate=rate)
        _on_chunk_done(chars_total)
        return

    chunks = _split_text_into_chunks(content)
    if len(chunks) == 1:
        await _text_to_mp3_with_retry(content, output_path, engine=engine, voice=voice, rate=rate)
        _on_chunk_done(chars_total)
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
            log_message(f"  [{idx}/{total}] ({pct}%) TTS: {ch.title}")
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
            # Chuẩn hóa âm lượng sau BGM để mọi chương (có/không nhạc) cùng mức nghe.
            _apply_loudness_norm(output_path)
            if not output_path.is_file() or output_path.stat().st_size <= 0:
                raise RuntimeError(f"Không tạo được file MP3: {output_path}")
            update_chapter_mp3(ch.id, str(output_path))
            return output_path
        except Exception as exc:
            update_tts_status(ch.id, STATUS_FAILED)
            if not quiet:
                log_message(f"[TTS Lỗi] Ch.{ch.chapter_number} ({ch.title}): {exc}")
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
                log_message(f"  Lỗi TTS: {ch.title} — {result}")
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
    if engine == "vieneu":
        asyncio.run(
            _write_vieneu_chunks(
                _split_vieneu_chunks(_prepare_vieneu_speech(normalized)),
                output_path,
                asyncio.Semaphore(TTS_CHUNK_CONCURRENCY),
                voice=voice,
                rate=rate,
            )
        )
        return
    asyncio.run(_text_to_mp3(normalized, output_path, engine=engine, voice=voice, rate=rate))


def chapter_to_mp3(text: str, output_path: Path) -> None:
    from config import load_tts_settings

    settings = load_tts_settings()
    text = _normalize_tts_text(text)
    if not text:
        raise ValueError("Nội dung chương rỗng sau khi chuẩn hóa")
    engine = str(settings["engine"])
    voice = str(settings["voice"])
    rate = str(settings["rate"])
    if engine == "vieneu":
        asyncio.run(
            _write_vieneu_chunks(
                _split_vieneu_chunks(_prepare_vieneu_speech(text)),
                output_path,
                asyncio.Semaphore(TTS_CHUNK_CONCURRENCY),
                voice=voice,
                rate=rate,
            )
        )
    else:
        asyncio.run(
            _text_to_mp3_with_retry(
                text,
                output_path,
                engine=engine,
                voice=voice,
                rate=rate,
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
        log_message(f"Bỏ qua {already_have} chương đã có MP3 hợp lệ.")

    if not chapters:
        if not quiet:
            log_message("Không có chương nào cần tạo MP3.")
        return []

    if ENABLE_TTS_CHUNK and not _ffmpeg_on_path() and not quiet:
        log_message(
            "Lưu ý: chưa cài ffmpeg — ghép chunk MP3 bằng nối byte "
            "(vẫn nghe được, chất lượng tương đương)."
        )
    mix_bgm = bool(use_bgm) and _bgm_enabled() and _ffmpeg_on_path()
    if use_bgm and _bgm_enabled() and not mix_bgm and not quiet:
        log_message(
            "Lưu ý: không có ffmpeg — bỏ nhạc nền, vẫn tạo MP3 giọng đọc. "
            "Cài ffmpeg: winget install Gyan.FFmpeg"
        )
    if mix_bgm and not quiet:
        log_message(f"Nhạc nền: {BGM_PATH} ({BGM_VOLUME_DB} dB, loop={BGM_LOOP})")

    chunk_info = ""
    if ENABLE_TTS_CHUNK:
        chunk_info = f", chunk concurrency={TTS_CHUNK_CONCURRENCY}"
    if not quiet:
        if engine == "vieneu":
            log_message(f"Tạo MP3 cho {len(chapters)} chương (VieNeu, voice={voice}{chunk_info})...")
        else:
            log_message(
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
            log_message("[TTS] Đã dừng. Chạy lại để resume các chương chưa hoàn thành.")
        return []

    if not quiet:
        log_message(
            f"Tổng kết TTS: {len(success)} thành công, "
            f"{len(empty_skipped)} bỏ qua (rỗng), {len(failed)} lỗi"
        )
        if failed:
            log_message("Chương lỗi:")
            for ch in failed:
                log_message(f"  - [{ch.chapter_number}] {ch.title}")

    return success
