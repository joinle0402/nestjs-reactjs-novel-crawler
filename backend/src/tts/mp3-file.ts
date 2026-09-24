import { existsSync, statSync } from 'fs';
import path from 'path';
import { resolveWorkerDir } from './tts-settings.service';

function isFile(candidate: string): boolean {
    try {
        return existsSync(candidate) && statSync(candidate).isFile();
    } catch {
        return false;
    }
}

/**
 * Khớp db._mp3_needs_generation. Worker ghi mp3_path tương đối từ thư mục worker/,
 * còn Nest chạy từ backend/ nên path tương đối phải resolve về worker/.
 */
export function mp3FileReady(mp3Path: string | null | undefined): boolean {
    const trimmed = mp3Path?.trim();
    if (!trimmed) {
        return false;
    }
    if (isFile(trimmed)) {
        return true;
    }
    if (!path.isAbsolute(trimmed)) {
        return isFile(path.resolve(resolveWorkerDir(), trimmed));
    }
    return false;
}
