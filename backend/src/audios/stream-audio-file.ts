import { HttpStatus } from '@nestjs/common';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import type { Request, Response } from 'express';
import { throwUnless } from 'src/common/utils/throw-if';

export async function streamAudioFile(absolutePath: string, req: Request, res: Response, contentType = 'audio/mpeg'): Promise<void> {
    const fileStat = await stat(absolutePath);
    const fileSize = fileStat.size;
    const rangeHeader = req.headers.range;

    if (!rangeHeader) {
        res.status(200);
        res.setHeader('Content-Type', contentType);
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
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Range', `bytes ${start}-${safeEnd}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    createReadStream(absolutePath, { start, end: safeEnd }).pipe(res);
}
