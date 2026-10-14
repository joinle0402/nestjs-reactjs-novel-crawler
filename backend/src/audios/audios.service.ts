import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import { throwUnless } from 'src/common/utils/throw-if';
import { streamAudioFile } from './stream-audio-file';

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

    streamFile(absolutePath: string, req: Request, res: Response, contentType = 'audio/mpeg'): Promise<void> {
        return streamAudioFile(absolutePath, req, res, contentType);
    }
}
