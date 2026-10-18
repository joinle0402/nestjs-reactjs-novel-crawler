import { HttpStatus } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { throwUnless } from 'src/common/utils/throw-if';
import { resolveWorkerDir } from 'src/tts/tts-settings.service';

export const MAX_COVER_BYTES = 8 * 1024 * 1024;

export type UploadedCover = {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
};

const MIME_TO_EXTENSION = new Map<string, string>([
    ['image/jpeg', '.jpg'],
    ['image/jpg', '.jpg'],
    ['image/png', '.png'],
    ['image/webp', '.webp'],
    ['image/gif', '.gif'],
    ['image/avif', '.avif'],
]);

const EXTENSION_TO_TYPE = new Map<string, string>([
    ['.jpg', 'image/jpeg'],
    ['.jpeg', 'image/jpeg'],
    ['.png', 'image/png'],
    ['.webp', 'image/webp'],
    ['.gif', 'image/gif'],
    ['.avif', 'image/avif'],
]);

/** Ảnh cover có thể là URL nguồn (cào về) hoặc tên file nội bộ do người dùng upload. */
export function isRemoteCover(value: string | null | undefined): boolean {
    return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

export function coversDir(): string {
    return path.join(resolveWorkerDir(), 'covers');
}

export function coverContentType(fileName: string): string {
    return EXTENSION_TO_TYPE.get(path.extname(fileName).toLowerCase()) ?? 'application/octet-stream';
}

/** Chỉ cho phép tên file phẳng nằm trong thư mục covers. */
export function safeCoverPath(fileName: string): string | null {
    if (!fileName || fileName !== path.basename(fileName) || fileName.includes('..')) {
        return null;
    }
    const root = path.resolve(coversDir());
    const absolute = path.resolve(root, fileName);
    const prefix = root.endsWith(path.sep) ? root : root + path.sep;
    if (absolute !== root && !absolute.toLowerCase().startsWith(prefix.toLowerCase())) {
        return null;
    }
    return absolute;
}

/** Ghi ảnh upload vào worker/covers; trả về tên file để lưu vào DB. */
export async function saveUploadedCover(novelId: number, file: UploadedCover | undefined): Promise<string> {
    throwUnless(file && file.size > 0 && file.buffer?.length, 'Chọn file ảnh');
    throwUnless(file.size <= MAX_COVER_BYTES, 'Ảnh tối đa 8 MB');
    const extension = MIME_TO_EXTENSION.get((file.mimetype || '').toLowerCase());
    throwUnless(extension, 'Chỉ nhận ảnh jpg, png, webp, gif hoặc avif');
    const fileName = `${novelId}-${randomUUID()}${extension}`;
    await mkdir(coversDir(), { recursive: true });
    await writeFile(path.join(coversDir(), fileName), file.buffer);
    return fileName;
}

/** Xóa file cover nội bộ nếu có (bỏ qua URL nguồn). */
export async function removeStoredCover(value: string | null | undefined): Promise<void> {
    if (!value || isRemoteCover(value)) {
        return;
    }
    const filePath = safeCoverPath(value);
    if (filePath && existsSync(filePath)) {
        await unlink(filePath);
    }
}

export function resolveStoredCover(fileName: string): { filePath: string; contentType: string } {
    const filePath = safeCoverPath(fileName);
    throwUnless(filePath && existsSync(filePath), 'Không tìm thấy ảnh bìa', HttpStatus.NOT_FOUND);
    return { filePath, contentType: coverContentType(fileName) };
}
