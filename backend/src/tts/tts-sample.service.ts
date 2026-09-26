import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { existsSync, statSync } from 'fs';
import { mkdir, rename, stat, unlink } from 'fs/promises';
import os from 'os';
import path from 'path';
import { Repository } from 'typeorm';
import { promisify } from 'util';
import { throwIf, throwUnless } from 'src/common/utils/throw-if';
import { TtsSampleRequest } from './dtos/requests/tts-sample.request';
import { TtsSavedSampleQuery } from './dtos/requests/tts-saved-sample.query';
import { TtsJob, TTS_ENGINES, type TtsEngine } from './entities/tts-job.entity';
import { resolveWorkerDir, TtsSettingsService } from './tts-settings.service';
import { resolvePythonLaunch } from './tts-worker.service';

const execFileAsync = promisify(execFile);
const SAMPLE_TIMEOUT_MS = 10 * 60 * 1000;

/** Câu nghe thử lưu sẵn. Đổi câu thì sửa cả worker/tts_sample.py. */
export const TTS_SAVED_SAMPLE_TEXT = 'Xin chào. Đây là đoạn thử giọng đọc. Nếu bạn nghe rõ câu này, giọng đã chọn đang hoạt động.';

const INVALID_FILENAME = /[<>:"/\\|?*]/g;

export type TtsSampleFile = {
    filePath: string;
    temporary: boolean;
};

/** Tên file phải khớp cache_filename() trong worker/tts_sample.py. */
export function ttsSampleCacheName(engine: string, voice: string, rate: string): string {
    const voicePart = voice.replace(INVALID_FILENAME, '_');
    if (engine === 'vieneu') {
        return `vieneu__${voicePart}.mp3`;
    }
    const ratePart = rate.replace('+', 'plus').replace('-', 'minus').replace('%', '');
    return `edge-tts__${voicePart}__${ratePart}.mp3`;
}

function normalizeSampleText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

function fileReady(filePath: string): boolean {
    try {
        return existsSync(filePath) && statSync(filePath).size > 100;
    } catch {
        return false;
    }
}

@Injectable()
export class TtsSampleService {
    private readonly logger = new Logger(TtsSampleService.name);
    private readonly pending = new Map<string, Promise<string>>();

    constructor(
        private readonly settingsService: TtsSettingsService,
        @InjectRepository(TtsJob)
        private readonly jobsRepository: Repository<TtsJob>,
    ) {}

    savedPath(query: TtsSavedSampleQuery): string | null {
        const filePath = this.cacheFile(query.engine, query.voice, query.rate);
        return fileReady(filePath) ? filePath : null;
    }

    async create(request: TtsSampleRequest): Promise<TtsSampleFile> {
        const text = normalizeSampleText(request.text);
        throwUnless(text.length > 0, 'Nhập câu để nghe thử');
        await this.assertVoice(request.engine, request.voice);

        if (text === TTS_SAVED_SAMPLE_TEXT) {
            const filePath = await this.savedOrCreate(request.engine, request.voice, request.rate, text);
            return { filePath, temporary: false };
        }

        const filePath = await this.synthesizeTemp(request.engine, request.voice, request.rate, text);
        return { filePath, temporary: true };
    }

    private async savedOrCreate(engine: string, voice: string, rate: string, text: string): Promise<string> {
        const filePath = this.cacheFile(engine, voice, rate);
        if (fileReady(filePath)) {
            this.logger.log(`Phát mẫu đã lưu engine=${engine} voice=${voice}`);
            return filePath;
        }

        const existing = this.pending.get(filePath);
        if (existing) {
            return existing;
        }

        const created = this.synthesizeCache(filePath, engine, voice, rate, text).finally(() => {
            this.pending.delete(filePath);
        });
        this.pending.set(filePath, created);
        return created;
    }

    private cacheFile(engine: string, voice: string, rate: string): string {
        return path.join(resolveWorkerDir(), 'output', 'tts-samples', ttsSampleCacheName(engine, voice, rate));
    }

    private async assertVoice(engine: string, voice: string): Promise<void> {
        throwUnless(TTS_ENGINES.includes(engine as TtsEngine), 'Engine TTS không được hỗ trợ');
        const current = await this.settingsService.read();
        throwUnless(this.settingsService.allowedVoices(engine, current.voice).has(voice), 'Giọng không thuộc engine đã chọn');
    }

    private async synthesizeCache(filePath: string, engine: string, voice: string, rate: string, text: string): Promise<string> {
        if (fileReady(filePath)) {
            return filePath;
        }
        await this.assertVieNeuIdle(engine);
        await mkdir(path.dirname(filePath), { recursive: true });
        const partPath = filePath.replace(/\.mp3$/i, '.part.mp3');
        this.logger.log(`Lưu mẫu giọng engine=${engine} voice=${voice}`);
        try {
            await this.runPython(engine, voice, rate, text, partPath);
            if (!fileReady(partPath)) {
                throw new HttpException('Không tạo được file âm thanh', HttpStatus.BAD_GATEWAY);
            }
            await rename(partPath, filePath);
        } catch (error) {
            await unlink(partPath).catch(() => undefined);
            if (error instanceof HttpException) {
                throw error;
            }
            throw new HttpException(this.failureMessage(error), HttpStatus.BAD_GATEWAY);
        }
        return filePath;
    }

    private async synthesizeTemp(engine: string, voice: string, rate: string, text: string): Promise<string> {
        await this.assertVieNeuIdle(engine);
        const dir = path.join(os.tmpdir(), 'novel-crawler-tts-samples');
        await mkdir(dir, { recursive: true });
        const output = path.join(dir, `${randomUUID()}.mp3`);
        this.logger.log(`Mẫu giọng tạm engine=${engine} voice=${voice}`);
        try {
            await this.runPython(engine, voice, rate, text, output);
        } catch (error) {
            await unlink(output).catch(() => undefined);
            throw new HttpException(this.failureMessage(error), HttpStatus.BAD_GATEWAY);
        }
        const info = await stat(output).catch(() => null);
        if (!info || info.size === 0) {
            await unlink(output).catch(() => undefined);
            throw new HttpException('Không tạo được file âm thanh', HttpStatus.BAD_GATEWAY);
        }
        return output;
    }

    private async assertVieNeuIdle(engine: string): Promise<void> {
        if (engine !== 'vieneu') {
            return;
        }
        const active = await this.jobsRepository.findOne({
            where: [{ status: 'pending' }, { status: 'running' }],
        });
        throwIf(active, 'Đang tạo audio. Nghe thử VieNeu sau khi job xong để tránh tải model hai lần.');
    }

    private async runPython(engine: string, voice: string, rate: string, text: string, output: string): Promise<void> {
        const script = path.join(resolveWorkerDir(), 'tts_sample.py');
        throwUnless(existsSync(script), 'Không thấy worker/tts_sample.py', HttpStatus.INTERNAL_SERVER_ERROR);
        const python = resolvePythonLaunch();
        await execFileAsync(python.command, [...python.prefix, '-u', script, '--engine', engine, '--voice', voice, '--rate', rate, '--text', text, '--output', output], {
            cwd: resolveWorkerDir(),
            timeout: SAMPLE_TIMEOUT_MS,
            windowsHide: true,
            maxBuffer: 1024 * 1024,
            encoding: 'utf8',
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        });
    }

    private failureMessage(error: unknown): string {
        const failed = error as { killed?: boolean; stderr?: string };
        if (failed.killed) {
            return 'Hết thời gian chờ mẫu giọng (tối đa 10 phút).';
        }
        const stderr = typeof failed.stderr === 'string' ? failed.stderr.trim() : '';
        const line = stderr.split(/\r?\n/).filter(Boolean).at(-1);
        if (line) {
            return line.slice(0, 300);
        }
        return 'Không tạo được mẫu giọng';
    }
}
