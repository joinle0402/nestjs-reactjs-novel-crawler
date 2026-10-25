import { spawn } from 'child_process';
import { existsSync, mkdirSync, statSync } from 'fs';
import path from 'path';
import { resolveWorkerDir } from '../tts/tts-settings.service';

/** Bản TypeScript của `_safe_filename` trong worker/tts.py — tên thư mục MP3 của truyện. */
export function safeFolderName(text: string, maxLen = 80): string {
    const cleaned = text
        .replace(/[<>:"/\\|?*]/g, '')
        .trim()
        .replace(/\s+/g, ' ');
    return cleaned.slice(0, maxLen) || 'chapter';
}

/** Thư mục gốc chứa MP3 từng truyện, khớp `MP3_OUTPUT_DIR` của worker. */
export function mp3RootDir(): string {
    return path.join(resolveWorkerDir(), 'output', 'mp3');
}

function isDirectory(candidate: string): boolean {
    try {
        return existsSync(candidate) && statSync(candidate).isDirectory();
    } catch {
        return false;
    }
}

function isInside(root: string, candidate: string): boolean {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export type NovelFolder = {
    /** Đường dẫn tuyệt đối sẽ mở. */
    path: string;
    /** `true` khi tìm thấy đúng thư mục MP3 của truyện. */
    found: boolean;
};

/**
 * Tìm thư mục MP3 của truyện trên máy chạy backend.
 * Ưu tiên `mp3_path` đã lưu (đúng cả khi truyện được đổi tên), sau đó mới đoán theo tên truyện.
 * Không tìm thấy thì trả về thư mục gốc `output/mp3`.
 */
export function resolveNovelMp3Folder(novelTitle: string, mp3Paths: Array<string | null | undefined>, root = mp3RootDir()): NovelFolder {
    for (const mp3Path of mp3Paths) {
        const trimmed = mp3Path?.trim();
        if (!trimmed) {
            continue;
        }
        const absolute = path.isAbsolute(trimmed) ? trimmed : path.resolve(resolveWorkerDir(), trimmed);
        const folder = path.dirname(absolute);
        if (isInside(root, folder) && isDirectory(folder)) {
            return { path: folder, found: true };
        }
    }

    const byTitle = path.join(root, safeFolderName(novelTitle));
    if (isInside(root, byTitle) && isDirectory(byTitle)) {
        return { path: byTitle, found: true };
    }

    return { path: root, found: false };
}

/**
 * Mở thư mục bằng File Explorer của máy chủ.
 * Trên Windows gọi thẳng `explorer.exe` — PowerShell `Invoke-Item`/`Start-Process` chạy
 * non-interactive thì không mở cửa sổ nào. `spawn` truyền nguyên đường dẫn trong một tham số
 * nên tên truyện có dấu phẩy (rất phổ biến) vẫn mở đúng thư mục.
 *
 * KHÔNG truyền `windowsHide`: Node map cờ đó thành `STARTUPINFO.wShowWindow = SW_HIDE`, explorer.exe
 * kế thừa và tạo cửa sổ ở trạng thái ẩn (title còn có hậu tố `[ main ↓0 ↑0 ]`) — API trả đường dẫn
 * nhưng người dùng không thấy cửa sổ nào. explorer.exe là app GUI nên không cần ẩn console.
 */
export function openFolderInExplorer(folderPath: string): void {
    mkdirSync(folderPath, { recursive: true });

    const command = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const child = spawn(command, [folderPath], { detached: true, stdio: 'ignore' });
    child.on('error', () => {
        // Không có trình quản lý tệp (vd. chạy trong container) — bỏ qua, API vẫn trả đường dẫn.
    });
    child.unref();
}
