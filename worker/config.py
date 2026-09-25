"""Cấu hình crawler sangtacviet.com — sửa các giá trị dưới đây rồi chạy crawler.py."""

import json
import os
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parent
REPO_ROOT = WORKER_DIR.parent


def _load_env_file(path: Path, override: bool = False) -> None:
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if not key:
            continue
        if override or key not in os.environ:
            os.environ[key] = value


# Cùng DB với Nest: đọc backend/.env, worker/.env ghi đè nếu có
_load_env_file(REPO_ROOT / "backend" / ".env", override=False)
_load_env_file(WORKER_DIR / ".env", override=True)

# Dán URL truyện vào đây, ví dụ:
# https://sangtacviet.com/truyen/69shu/1/53962/
NOVEL_URL = "https://sangtacviet.com/truyen/fanqie/1/7275986706002627646/"

# Giới hạn mặc định khi Enter (phiên nhỏ = an toàn hơn). Đặt None = hết miễn phí.
# 50 chương: chia range 1-10, 11-20... nhiều phiên, nghỉ vài giờ giữa phiên.
MAX_CHAPTERS = 10

# Delay giữa các chương (giây) — random [MIN, MAX]; chậm hơn = ít rate-limit
DELAY_BETWEEN_CHAPTERS_MIN = 10
DELAY_BETWEEN_CHAPTERS_MAX = 20
# Nghỉ dài sau mỗi N chương đã cào thành công trong phiên
CRAWL_BATCH_EVERY = 5
CRAWL_BATCH_PAUSE_SEC = 180  # 3 phút
# Chờ trước khi thử lại sau 403 (ban tạm có thể vài phút–vài giờ)
CRAWL_403_COOLDOWN_SEC = 300  # 5 phút
# True = luôn mở trang danh sách truyện trước; False = bỏ qua nếu DB đã có list chương
# (vẫn mở trang danh sách khi DB chưa có novel/list chương)
CRAWL_VISIT_NOVEL_PAGE = False

# MySQL — cùng database với NestJS backend
DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3306"))
DB_USERNAME = os.environ.get("DB_USERNAME", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_DATABASE = os.environ.get("DB_DATABASE", "novel_crawler")

# SQLite cũ — chỉ dùng khi migrate
SQLITE_PATH = os.environ.get("SQLITE_PATH", str(WORKER_DIR / "novels.db"))
DB_PATH = SQLITE_PATH

# Thư mục lưu file MP3 (luôn trong worker/, không phụ thuộc cwd)
MP3_OUTPUT_DIR = str(WORKER_DIR / "output" / "mp3")

# Google Drive — upload folder MP3
GDRIVE_ENABLED = True
GDRIVE_CREDENTIALS = str(WORKER_DIR / "client_secret.json")
GDRIVE_TOKEN = str(WORKER_DIR / "token.json")
GDRIVE_ROOT_FOLDER = "novel-crawler-mp3"
GDRIVE_AUTO_AFTER_TTS = False  # True = tự upload sau khi TTS xong

# Nhạc nền MP3 — đặt None để tắt
BGM_PATH = str(WORKER_DIR / "Just_Stay_Aakash_Gandhi.mp3")
BGM_VOLUME_DB = -18  # âm lượng nhạc nền (dB, số âm = nhỏ hơn giọng)
BGM_LOOP = True  # lặp nhạc nếu chương dài hơn track
BGM_FADE_IN_MS = 2000
BGM_FADE_OUT_MS = 3000
BGM_EXPORT_BITRATE = "128k"

# TTS — edge-tts (miễn phí, giọng neural tiếng Việt)
# Giọng, tốc độ và bật/tắt nhạc nền chỉ nằm ở file này.
# Web (Cài đặt) và console cùng đọc/ghi; BGM_PATH bên trên vẫn là file nhạc.
TTS_SETTINGS_PATH = WORKER_DIR / "tts_settings.json"
_TTS_SETTING_DEFAULTS = {
    "engine": "edge-tts",
    "voice": "vi-VN-HoaiMyNeural",
    "rate": "+50%",
    "bgmEnabled": True,
}


def load_tts_settings() -> dict:
    """Đọc mặc định TTS. Ghi file lần đầu nếu chưa có."""
    global TTS_ENGINE, TTS_VOICE, TTS_RATE, TTS_BGM_ENABLED
    data = dict(_TTS_SETTING_DEFAULTS)
    if TTS_SETTINGS_PATH.is_file():
        try:
            loaded = json.loads(TTS_SETTINGS_PATH.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            loaded = None
        if isinstance(loaded, dict):
            for key, default in _TTS_SETTING_DEFAULTS.items():
                if key not in loaded or loaded[key] in (None, ""):
                    continue
                data[key] = loaded[key]
    else:
        TTS_SETTINGS_PATH.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    data["bgmEnabled"] = bool(data["bgmEnabled"])
    TTS_ENGINE = str(data["engine"])
    TTS_VOICE = str(data["voice"])
    TTS_RATE = str(data["rate"])
    TTS_BGM_ENABLED = data["bgmEnabled"]
    return data


TTS_ENGINE = str(_TTS_SETTING_DEFAULTS["engine"])
TTS_VOICE = str(_TTS_SETTING_DEFAULTS["voice"])
TTS_RATE = str(_TTS_SETTING_DEFAULTS["rate"])
TTS_BGM_ENABLED = bool(_TTS_SETTING_DEFAULTS["bgmEnabled"])
load_tts_settings()

# Playwright
HEADLESS = False  # False để người dùng giải captcha
BROWSER_STEALTH = False  # playwright-stealth: ẩn navigator.webdriver, v.v.
BROWSER_CHANNEL = 'chrome'  # "chrome" = dùng Google Chrome đã cài (nếu có)
BROWSER_LOCALE = "vi-VN"
BROWSER_TIMEZONE = "Asia/Ho_Chi_Minh"
BROWSER_MAXIMIZED = True  # mở Chrome full màn hình khi cào
BROWSER_TIMEOUT_MS = 60_000
CONTENT_LOAD_TIMEOUT_MS = 120_000
# Chờ nội dung chương tối đa bao lâu trước khi F5 reload (ít F5 = ít bị flag)
CONTENT_RELOAD_AFTER_SEC = 60
MAX_CONTENT_RELOADS = 1

# Số chương TTS chạy song song (edge-tts) — quá cao dễ bị rate-limit
TTS_CONCURRENCY = 1

# Retry TTS khi edge-tts lỗi (exponential backoff: 2s, 4s, ...)
TTS_MAX_RETRIES = 3

# Nghỉ giữa các request edge-tts (giây) — tránh NoAudioReceived
TTS_REQUEST_DELAY_SEC = 1.0

# Chia nội dung dài thành chunk trước khi TTS (ffmpeg tùy chọn cho ghép)
ENABLE_TTS_CHUNK = True
TTS_CHUNK_SIZE = 3000  # ký tự mỗi chunk; khoảng 2500–4000 ít phiên hơn mà vẫn ổn định
TTS_CHUNK_CONCURRENCY = 1  # số chunk TTS song song trong 1 chương

# Lưu session Playwright sau captcha (tái sử dụng lần sau)
BROWSER_STATE_PATH = str(WORKER_DIR / "browser_state.json")

# API danh sách chương
CHAPTER_LIST_API = (
    "https://sangtacviet.com/index.php"
    "?ngmar=chapterlist&h={h}&bookid={bookid}&sajax=getchapterlist"
)
# Trong response API: field đầu = 1 là chương miễn phí, khác 1 là VIP
CHAPTER_FREE_STATUS = "1"

# Selector (từ selector.txt)
SELECTORS = {
    "book_title": "#book_name2",
    "book_author": ".cap h2",
    "book_summary": "#book-sumary",
    # Nội dung chương thật có attr cid; .contentbox đầu tiên thường là placeholder
    "content_box": ".contentbox[cid]",
    "language_option": '.seloption[value="vi"]',
    "loading_text": "Đang tải nội dung chương",
    "placeholder_text": "Đọc trên web",
}
