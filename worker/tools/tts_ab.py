"""Render A/B các cấu hình VieNeu trên cùng một đoạn truyện.

Chạy bằng venv của VieNeu (không phải python của worker):

    worker/.venv-vieneu/Scripts/python.exe worker/tools/tts_ab.py

Kết quả: worker/output/tts-ab/x1/<label>.mp3 (bản gốc 1.0x) và
worker/output/tts-ab/x1.5/<label>.mp3 (kéo 1.5x bằng rubberband, giữ cao độ),
kèm index.txt mô tả từng biến thể.

Script chỉ để nghe thử, không tham gia pipeline TTS.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import time
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent.parent
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

import config  # noqa: E402,F401  (nạp worker/.env: VIENEU_BACKEND, HF_HOME...)
from tts_vieneu import _wav_to_mp3, load_engine  # noqa: E402

OUT_DIR = WORKER_DIR / "output" / "tts-ab"
REF_DIR = WORKER_DIR / "ref_voices"

# Đoạn có tường thuật + thoại + câu hỏi, dưới 700 ký tự nên pipeline chỉ gọi
# engine một lần (đúng đường chạy thật của một đoạn ngắn).
TEXT = (
    "Trời vừa tối, hắn đã có mặt ở đầu con hẻm. Ngõ nhỏ, ẩm ướt, hai bên là những "
    "bức tường loang lổ. Hắn dừng lại, nghe ngóng. Phía trong vọng ra tiếng nói: "
    "“Đi nhanh lên, sắp muộn rồi.” Hắn nhíu mày, tự hỏi: rốt cuộc chuyện này là sao? "
    "Ba ngày trước, mọi thứ vẫn còn bình thường."
)

# label -> (file giọng mẫu, tham số infer)
VARIANTS = {
    "01_baseline": ("hoaimy.wav", {}),
    "02_temp065": ("hoaimy.wav", {"temperature": 0.65}),
    "03_temp090": ("hoaimy.wav", {"temperature": 0.90}),
    "04_topk40": ("hoaimy.wav", {"top_k": 40}),
    "05_maxchars400": ("hoaimy.wav", {"max_chars": 400}),
    "06_ref_short_a": ("ab/hoaimy_a_ref.wav", {}),
    "07_ref_long_c": ("ab/hoaimy_c_ref.wav", {}),
}

SPEED = 1.5


def _speed_copy(src: Path, dest: Path, tempo: float) -> bool:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return False
    dest.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        [ffmpeg, "-y", "-i", str(src), "-filter:a", f"rubberband=tempo={tempo}", "-b:a", "192k", str(dest)],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.returncode == 0 and dest.is_file()


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    engine = load_engine()

    refs = {}
    for label, (ref_name, _params) in VARIANTS.items():
        path = REF_DIR / ref_name
        if not path.is_file():
            print(f"thiếu file mẫu: {path}", flush=True)
            return 1
        if ref_name not in refs:
            voice = f"AB-{path.stem}"
            engine.add_voice(voice, str(path), denoise=False)
            refs[ref_name] = voice

    rows = []
    for label, (ref_name, params) in VARIANTS.items():
        started = time.monotonic()
        audio = engine.infer(TEXT, voice=refs[ref_name], **params)
        wav_path = OUT_DIR / f"{label}.wav"
        engine.save(audio, str(wav_path))
        mp3_path = OUT_DIR / "x1" / f"{label}.mp3"
        mp3_path.parent.mkdir(parents=True, exist_ok=True)
        _wav_to_mp3(wav_path, mp3_path)
        wav_path.unlink(missing_ok=True)
        _speed_copy(mp3_path, OUT_DIR / f"x{SPEED}" / f"{label}.mp3", SPEED)
        seconds = len(audio) / 48000
        rows.append((label, ref_name, params, round(seconds, 1), round(time.monotonic() - started, 1)))
        print(f"{label}: {seconds:.1f}s audio ({time.monotonic() - started:.1f}s render)", flush=True)

    _write_index(rows)
    print(f"\nxong: {OUT_DIR}", flush=True)
    return 0


_HINT = {
    "01_baseline": "Mốc so sánh: đúng cấu hình đang chạy.",
    "02_temp065": "Temperature thấp: ổn định hơn, ít lỗi ngẫu nhiên, có thể hơi đều.",
    "03_temp090": "Temperature cao: biểu cảm hơn, rủi ro phát âm lạc.",
    "04_topk40": "Top-k rộng hơn: đa dạng cách chọn âm, dễ nghe tự nhiên hơn hoặc lảm nhảm.",
    "05_maxchars400": "Sinh 400 ký tự mỗi lần thay vì 256: ít reset ngữ điệu giữa câu.",
    "06_ref_short_a": "Giọng mẫu ngắn 13.7s (cùng nguồn edge-tts).",
    "07_ref_long_c": "Giọng mẫu dài 38s (cùng nguồn edge-tts).",
}


def _write_index(rows: list) -> None:
    import html

    cards = []
    for label, ref_name, params, audio_seconds, render_seconds in rows:
        detail = ", ".join(f"{k}={v}" for k, v in params.items()) or "temp 0.8, top_k 25, max_chars 256"
        cards.append(
            f'<section class="row">'
            f'<div class="meta"><h2>{html.escape(label)}</h2>'
            f"<p>{html.escape(_HINT.get(label, ''))}</p>"
            f'<p class="small">ref: {html.escape(ref_name)} · {html.escape(detail)} · '
            f"{audio_seconds}s audio</p></div>"
            f'<div class="players">'
            f'<label>x1 <audio controls preload="metadata" src="x1/{label}.mp3"></audio></label>'
            f'<label>x{SPEED} <audio controls preload="metadata" src="x{SPEED}/{label}.mp3"></audio></label>'
            f"</div></section>"
        )

    page = f"""<!doctype html>
<html lang="vi">
<meta charset="utf-8">
<title>A/B giọng VieNeu — Hoài My clone</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ font: 15px/1.5 system-ui, sans-serif; max-width: 980px; margin: 40px auto; padding: 0 20px; }}
  h1 {{ font-size: 22px; margin-bottom: 4px; }}
  .note {{ color: #666; margin: 0 0 28px; }}
  .row {{ display: grid; grid-template-columns: 1fr 360px; gap: 24px; align-items: center;
         padding: 16px 0; border-top: 1px solid rgba(128,128,128,.28); }}
  h2 {{ font-size: 15px; margin: 0 0 4px; font-family: ui-monospace, monospace; }}
  p {{ margin: 0; }}
  .small {{ color: #777; font-size: 12px; margin-top: 6px; }}
  .players {{ display: grid; gap: 8px; }}
  .players label {{ display: grid; grid-template-columns: 34px 1fr; align-items: center;
                    font-size: 12px; color: #777; }}
  audio {{ width: 100%; height: 34px; }}
  @media (max-width: 720px) {{ .row {{ grid-template-columns: 1fr; }} }}
</style>
<h1>A/B giọng VieNeu — Hoài My clone</h1>
<p class="note">Cùng một đoạn text, chỉ đổi một biến mỗi dòng. Nghe cột <b>x1</b> để so chất giọng,
cột <b>x{SPEED}</b> để biết cảm giác khi nghe nhanh. Đoạn text: “{html.escape(TEXT)}”</p>
{''.join(cards)}
</html>
"""
    (OUT_DIR / "index.html").write_text(page, encoding="utf-8")



if __name__ == "__main__":
    raise SystemExit(main())
