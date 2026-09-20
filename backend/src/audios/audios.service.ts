import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, existsSync } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import type { Request, Response } from 'express';
import { throwUnless } from 'src/common/utils/throw-if';

@Injectable()
export class AudiosService {
    private readonly storageRoot: string;

    constructor(private readonly configService: ConfigService) {
        const configured = this.configService.get<string>('STORAGE_ROOT');
        this.storageRoot = path.resolve(
            configured?.trim() || path.join(process.cwd(), '..', 'worker', 'output', 'mp3'),
        );
    }

    /**
     * Resolve mp3_path từ DB (worker thường lưu absolute path).
     * Cho phép absolute nếu file nằm trong STORAGE_ROOT; relative thì resolve dưới root.
     */
    resolveSafePath(mp3Path: string): string {
        const trimmed = mp3Path.trim();
        throwUnless(trimmed, 'Đường dẫn MP3 trống', HttpStatus.NOT_FOUND);

        const absolute = path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(this.storageRoot, trimmed);
        const root = path.resolve(this.storageRoot);
        const rootPrefix = root.endsWith(path.sep) ? root : root + path.sep;
        const allowed = path.resolve(absolute) === root || path.resolve(absolute).toLowerCase().startsWith(rootPrefix.toLowerCase());
        throwUnless(allowed, `Đường dẫn MP3 ngoài STORAGE_ROOT (${this.storageRoot})`, HttpStatus.FORBIDDEN);
        throwUnless(existsSync(absolute), 'Không tìm thấy file MP3 trên đĩa', HttpStatus.NOT_FOUND);

        return absolute;
    }

    async streamFile(absolutePath: string, req: Request, res: Response): Promise<void> {
        const fileStat = await stat(absolutePath);
        const fileSize = fileStat.size;
        const rangeHeader = req.headers.range;

        if (!rangeHeader) {
            res.status(200);
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.setHeader('Content-Length', fileSize);
            createReadStream(absolutePath).pipe(res);
            return;
        }

        const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
        throwUnless(match, 'Range không hợp lệ', HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);

        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Number(match[2]) : fileSize - 1;

        throwUnless(Number.isFinite(start) && Number.isFinite(end) && start <= end && start < fileSize, 'Range không hợp lệ', HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE);

        const safeEnd = Math.min(end, fileSize - 1);
        const chunkSize = safeEnd - start + 1;

        res.status(206);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Content-Range', `bytes ${start}-${safeEnd}/${fileSize}`);
        res.setHeader('Content-Length', chunkSize);
        createReadStream(absolutePath, { start, end: safeEnd }).pipe(res);
    }
}
