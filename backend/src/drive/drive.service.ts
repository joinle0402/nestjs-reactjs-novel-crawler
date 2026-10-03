import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { execFile } from 'child_process';
import { existsSync, openSync, readFileSync, readSync, closeSync, statSync } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import { throwIf, throwUnless } from 'src/common/utils/throw-if';
import { Chapter } from 'src/chapters/chapters.entity';
import { NovelsService } from 'src/novels/novels.service';
import { resolvePythonLaunch, type PythonLaunch } from 'src/tts/tts-worker.service';
import { mp3FileReady } from 'src/tts/mp3-file';
import {
    formatChapterList,
    parseChapterRange,
    type ChapterRange,
} from 'src/tts/chapter-range';
import { resolveWorkerDir } from 'src/tts/tts-settings.service';
import { StartDriveJobRequest } from './dtos/requests/start-drive-job.request';
import { DriveJobProgress, DriveJobResponse } from './dtos/responses/drive-job.response';
import { DriveChaptersPreview, DrivePreviewResponse } from './dtos/responses/drive-preview.response';
import { DriveStatusResponse } from './dtos/responses/drive-status.response';
import { DriveUploadJob, type DriveFailedFile, type DriveFileResult } from './entities/drive-upload-job.entity';

const execFileAsync = promisify(execFile);
const DRIVE_JOB_LOCK = 'novel_crawler_drive_job';
const RECENT_JOB_MS = 20_000;
const DRIVE_CHECK_TIMEOUT_MS = 120_000;
const DRIVE_CHECK_CACHE_TTL_MS = 30_000;

type DriveConfig = { credentials: string; token: string; rootFolder: string };

type Mp3Fact = {
    chapterNumber: number;
    fileName: string;
    sizeBytes: number;
};

type DriveCheckResult = {
    checked: boolean;
    folderPath: string | null;
    folderId: string | null;
    existing: Set<string> | null;
};

function workerFileName(filePath: string): string {
    try {
        return statSync(filePath).isFile() ? path.basename(filePath) : '';
    } catch {
        return '';
    }
}

/** Đọc 3 hằng GDRIVE_* từ worker/config.py (giá trị chuỗi đơn giản). */
function readDriveConfig(workerDir: string): DriveConfig {
    const defaults: DriveConfig = {
        credentials: path.join(workerDir, 'client_secret.json'),
        token: path.join(workerDir, 'token.json'),
        rootFolder: 'novel-crawler-mp3',
    };
    try {
        const configPath = path.join(workerDir, 'config.py');
        if (!existsSync(configPath)) {
            return defaults;
        }
        const content = readFileSync(configPath, 'utf8');
        const read = (name: string): string | null => {
            const match = new RegExp(`^${name}\\s*=\\s*["'](.+)["']\\s*(#.*)?$`, 'm').exec(content);
            return match?.[1]?.trim() ?? null;
        };
        return {
            credentials: read('GDRIVE_CREDENTIALS') ?? defaults.credentials,
            token: read('GDRIVE_TOKEN') ?? defaults.token,
            rootFolder: read('GDRIVE_ROOT_FOLDER') ?? defaults.rootFolder,
        };
    } catch {
        return defaults;
    }
}

@Injectable()
export class DriveService {
    private pythonLaunch: PythonLaunch | null = null;
    private driveConfig: DriveConfig | null = null;
    private checkCache = new Map<number, { at: number; result: DriveCheckResult }>();

    constructor(
        @InjectRepository(DriveUploadJob)
        private readonly jobsRepository: Repository<DriveUploadJob>,
        @InjectRepository(Chapter)
        private readonly chaptersRepository: Repository<Chapter>,
        private readonly novelsService: NovelsService,
        private readonly dataSource: DataSource,
    ) {}

    async status(): Promise<DriveStatusResponse> {
        const config = this.readConfig();
        return {
            credentialsReady: existsSync(config.credentials),
            tokenReady: existsSync(config.token),
        };
    }

    async preview(novelId: number, chapterRange?: string): Promise<DrivePreviewResponse> {
        const novel = await this.novelsService.findOne(novelId);
        const facts = await this.loadFacts(novel.id);
        const totalBytes = facts.reduce((sum, fact) => sum + fact.sizeBytes, 0);
        const check = await this.runDriveCheck(novel.id);
        const missingFacts = check.existing ? facts.filter((fact) => !check.existing!.has(fact.fileName)) : null;

        const trimmed = chapterRange?.trim();
        const chapters: DriveChaptersPreview | null = trimmed ? this.chaptersPreview(facts, trimmed, check) : null;

        return {
            totalFiles: facts.length,
            totalBytes,
            missingOnDrive: missingFacts ? missingFacts.length : null,
            missingBytes: missingFacts ? missingFacts.reduce((sum, fact) => sum + fact.sizeBytes, 0) : null,
            driveChecked: check.checked,
            driveFolder: check.folderPath,
            driveFolderId: check.folderId,
            existingNames: check.existing ? [...check.existing].sort() : null,
            chapters,
        };
    }

    /** Danh sách số chương có MP3 đã nằm trên Drive. Null khi chưa kiểm tra được Drive. */
    async getOnDriveChapterNumbers(novelId: number): Promise<number[] | null> {
        const novel = await this.novelsService.findOne(novelId);
        const check = await this.runDriveCheck(novel.id);
        if (!check.checked || !check.existing) {
            return null;
        }
        const facts = await this.loadFacts(novel.id);
        return facts.filter((fact) => check.existing!.has(fact.fileName)).map((fact) => fact.chapterNumber);
    }

    async start(request: StartDriveJobRequest): Promise<DriveJobResponse> {
        const novel = await this.novelsService.findOne(request.novelId);
        const facts = await this.loadFacts(novel.id);
        throwUnless(facts.length > 0, 'Chưa có chương nào có MP3 để upload', HttpStatus.BAD_REQUEST);

        let numbers: number[];
        let chapterRange: string | null = null;
        if (request.scope === 'missing') {
            numbers = facts.map((fact) => fact.chapterNumber);
        } else {
            const text = request.chapterRange?.trim() ?? '';
            throwUnless(text, 'Nhập phạm vi chương', HttpStatus.BAD_REQUEST);
            let parsed: ChapterRange;
            try {
                parsed = parseChapterRange(text, { maxAvailable: this.maxChapter(facts), useDefaultOnEmpty: false });
            } catch (error) {
                throw new HttpException(
                    error instanceof Error && error.name === 'ChapterRangeParseError' ? error.message : 'Phạm vi chương không hợp lệ',
                    HttpStatus.BAD_REQUEST,
                );
            }
            const wanted = new Set(parsed.kind === 'all' ? facts.map((fact) => fact.chapterNumber) : parsed.numbers);
            numbers = facts.filter((fact) => wanted.has(fact.chapterNumber)).map((fact) => fact.chapterNumber);
            chapterRange = text;
        }
        throwUnless(numbers.length > 0, 'Không có chương MP3 nào trong phạm vi đã chọn', HttpStatus.BAD_REQUEST);

        const saved = await this.insertJob({
            novelId: novel.id,
            scope: request.scope,
            chapterRange,
            chapterNumbers: numbers,
            totalFiles: numbers.length,
        });
        return this.toResponse(saved, novel.title);
    }

    async stop(): Promise<DriveJobResponse> {
        const active = await this.findActive();
        throwUnless(active, 'Không có job upload Drive đang chạy', HttpStatus.NOT_FOUND);

        const result = await this.jobsRepository.update(
            { id: active.id, status: In(['pending', 'running']) },
            { status: 'stopped', finishedAt: new Date() },
        );
        throwUnless(result.affected, 'Không có job upload Drive đang chạy', HttpStatus.NOT_FOUND);

        const stopped = await this.jobsRepository.findOneByOrFail({ id: active.id });
        const novel = await this.novelsService.findOne(stopped.novelId);
        return this.toResponse(stopped, novel.title);
    }

    async getCurrent(): Promise<DriveJobResponse | null> {
        const active = await this.findActive();
        if (active) {
            const novel = await this.novelsService.findOne(active.novelId);
            return this.toResponse(active, novel.title);
        }

        const recent = await this.jobsRepository.findOne({
            where: { status: In(['completed', 'failed', 'stopped']) },
            order: { id: 'DESC' },
        });
        if (!recent?.finishedAt) {
            return null;
        }
        if (Date.now() - new Date(recent.finishedAt).getTime() > RECENT_JOB_MS) {
            return null;
        }
        const novel = await this.novelsService.findOne(recent.novelId);
        return this.toResponse(recent, novel.title);
    }

    async getLast(novelId: number): Promise<DriveJobResponse | null> {
        await this.novelsService.findOne(novelId);
        const last = await this.jobsRepository.findOne({
            where: { novelId },
            order: { id: 'DESC' },
        });
        if (!last) {
            return null;
        }
        const novel = await this.novelsService.findOne(last.novelId);
        return this.toResponse(last, novel.title);
    }

    async getLogs(maxLines = 150): Promise<{ lines: string[] }> {
        const logPath = path.join(resolveWorkerDir(), 'logs', 'drive_worker.log');
        if (!existsSync(logPath)) {
            return { lines: [] };
        }
        try {
            const stats = await stat(logPath);
            const bytesToRead = Math.min(stats.size, 128 * 1024);
            const buffer = Buffer.alloc(bytesToRead);
            const fd = openSync(logPath, 'r');
            try {
                readSync(fd, buffer, 0, bytesToRead, Math.max(0, stats.size - bytesToRead));
            } finally {
                closeSync(fd);
            }
            const content = buffer.toString('utf-8');
            const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
            return { lines: lines.slice(-maxLines) };
        } catch (error) {
            return { lines: [`Không thể đọc log: ${error}`] };
        }
    }

    private chaptersPreview(facts: Mp3Fact[], text: string, check: DriveCheckResult): DriveChaptersPreview {
        try {
            const parsed = parseChapterRange(text, { maxAvailable: this.maxChapter(facts), useDefaultOnEmpty: false });
            const scoped = parsed.kind === 'all' ? facts : (() => {
                const wanted = new Set(parsed.numbers);
                return facts.filter((fact) => wanted.has(fact.chapterNumber));
            })();
            const scopedBytes = scoped.reduce((sum, fact) => sum + fact.sizeBytes, 0);
            const missing = check.existing ? scoped.filter((fact) => !check.existing!.has(fact.fileName)).length : null;
            return {
                error: null,
                preview: `${formatChapterList(scoped.map((fact) => fact.chapterNumber), '\u2013', ', ')} (${scoped.length} chương có MP3)`,
                count: scoped.length,
                willRun: scoped.length,
                willRunBytes: scopedBytes,
                willRunMissing: missing,
            };
        } catch (error) {
            const message = error instanceof Error && error.name === 'ChapterRangeParseError' ? error.message : 'Phạm vi chương không hợp lệ';
            return { error: message, preview: null, count: 0, willRun: 0, willRunBytes: 0, willRunMissing: null };
        }
    }

    private async findActive(): Promise<DriveUploadJob | null> {
        return this.jobsRepository.findOne({
            where: [{ status: 'pending' }, { status: 'running' }],
            order: { id: 'ASC' },
        });
    }

    private maxChapter(facts: Mp3Fact[]): number | null {
        if (facts.length === 0) {
            return null;
        }
        return Math.max(...facts.map((fact) => fact.chapterNumber));
    }

    private async insertJob(input: {
        novelId: number;
        scope: string;
        chapterRange: string | null;
        chapterNumbers: number[];
        totalFiles: number;
    }): Promise<DriveUploadJob> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        let acquired = false;
        try {
            await queryRunner.startTransaction();
            const locked = await queryRunner.query('SELECT GET_LOCK(?, 10) AS got', [DRIVE_JOB_LOCK]);
            acquired = this.lockAcquired(locked);
            throwUnless(acquired, 'Không lấy được khóa job upload Drive', HttpStatus.CONFLICT);

            const active = await queryRunner.manager.count(DriveUploadJob, {
                where: { status: In(['pending', 'running']) },
            });
            throwIf(active > 0, 'Đang có job upload Drive khác. Đợi job hiện tại xong hoặc dừng nó.', HttpStatus.CONFLICT);

            const job = queryRunner.manager.create(DriveUploadJob, {
                novelId: input.novelId,
                scope: input.scope as DriveUploadJob['scope'],
                chapterRange: input.chapterRange,
                chapterNumbers: input.chapterNumbers,
                totalFiles: input.totalFiles,
                status: 'pending' as const,
                startedAt: null,
                finishedAt: null,
                errorMessage: null,
            });
            const saved = await queryRunner.manager.save(job);
            await queryRunner.commitTransaction();
            return saved;
        } catch (error) {
            if (queryRunner.isTransactionActive) {
                await queryRunner.rollbackTransaction();
            }
            throw error;
        } finally {
            if (acquired) {
                try {
                    await queryRunner.query('SELECT RELEASE_LOCK(?)', [DRIVE_JOB_LOCK]);
                } catch {
                    // connection có thể đã đóng sau rollback
                }
            }
            await queryRunner.release();
        }
    }

    private lockAcquired(result: unknown): boolean {
        const row = Array.isArray(result) ? result[0] : result;
        const record = Array.isArray(row) ? row[0] : row;
        if (!record || typeof record !== 'object') {
            return false;
        }
        return Number((record as { got?: unknown }).got) === 1;
    }

    private async toResponse(job: DriveUploadJob, novelTitle: string): Promise<DriveJobResponse> {
        return {
            id: job.id,
            novelId: job.novelId,
            novelTitle,
            scope: job.scope,
            chapterRange: job.chapterRange,
            chapterNumbers: this.numbersOf(job),
            status: job.status,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
            errorMessage: job.errorMessage,
            progress: this.progress(job),
            failedFiles: this.failedFilesOf(job),
            fileResults: this.fileResultsOf(job),
        };
    }

    private progress(job: DriveUploadJob): DriveJobProgress {
        const total = job.totalFiles ?? 0;
        const uploaded = job.uploadedCount ?? 0;
        const skipped = job.skippedCount ?? 0;
        const failed = job.failedCount ?? 0;
        const processed = uploaded + skipped + failed;
        const percent = total > 0 ? Math.floor((processed * 100) / total) : 0;

        let detail: string;
        if (job.status === 'pending') {
            detail = 'Đang chờ worker nhận job upload';
        } else if (job.status === 'running') {
            detail = `upload ${processed}/${total} file · bỏ qua ${skipped}${failed > 0 ? ` · lỗi ${failed}` : ''}`;
            if (job.currentFile) {
                detail += ` · đang: ${job.currentFile}`;
            }
        } else if (job.status === 'completed') {
            detail = `${uploaded} upload · ${skipped} bỏ qua · ${failed} lỗi`;
        } else if (job.status === 'stopped') {
            detail = `Đã dừng sau ${processed}/${total} file`;
        } else {
            detail = job.errorMessage ?? 'Job upload thất bại';
        }

        return {
            done: uploaded,
            skipped,
            failed,
            processed,
            total,
            percent,
            currentFile: job.currentFile,
            detail,
        };
    }

    private numbersOf(job: DriveUploadJob): number[] {
        const value = job.chapterNumbers as unknown;
        if (typeof value === 'string') {
            try {
                return this.numbersOf({ ...job, chapterNumbers: JSON.parse(value) as number[] });
            } catch {
                return [];
            }
        }
        if (!Array.isArray(value)) {
            return [];
        }
        return value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0);
    }

    private failedFilesOf(job: DriveUploadJob): DriveFailedFile[] {
        const value = job.failedFiles as unknown;
        if (typeof value === 'string') {
            try {
                return this.failedFilesOf({ ...job, failedFiles: JSON.parse(value) as DriveFailedFile[] });
            } catch {
                return [];
            }
        }
        if (!Array.isArray(value)) {
            return [];
        }
        return value
            .filter((item): item is DriveFailedFile => Boolean(item) && typeof item === 'object')
            .map((item) => ({
                chapterNumber: Number(item.chapterNumber) || 0,
                name: String(item.name ?? ''),
                error: String(item.error ?? ''),
            }))
            .filter((item) => item.name.length > 0);
    }

    private fileResultsOf(job: DriveUploadJob): DriveFileResult[] {
        const value = job.fileResults as unknown;
        if (typeof value === 'string') {
            try {
                return this.fileResultsOf({ ...job, fileResults: JSON.parse(value) as DriveFileResult[] });
            } catch {
                return [];
            }
        }
        if (!Array.isArray(value)) {
            return [];
        }
        return value
            .filter((item): item is DriveFileResult => Boolean(item) && typeof item === 'object')
            .map((item) => ({
                chapterNumber: Number(item.chapterNumber) || 0,
                name: String(item.name ?? ''),
                status:
                    item.status === 'uploaded' || item.status === 'skipped' || item.status === 'failed'
                        ? item.status
                        : 'failed',
                error: item.error ? String(item.error) : undefined,
            }))
            .filter((item) => item.name.length > 0);
    }

    private readConfig(): DriveConfig {
        if (!this.driveConfig) {
            this.driveConfig = readDriveConfig(resolveWorkerDir());
        }
        return this.driveConfig;
    }

    /** Gọi worker/drive_check.py để liệt kê file đã có trên Drive (không tương tác). Kết quả cache TTL ngắn. */
    private async runDriveCheck(novelId: number): Promise<DriveCheckResult> {
        const cached = this.checkCache.get(novelId);
        if (cached && Date.now() - cached.at < DRIVE_CHECK_CACHE_TTL_MS) {
            return cached.result;
        }
        const result = await this.doRunDriveCheck(novelId);
        this.checkCache.set(novelId, { at: Date.now(), result });
        return result;
    }

    private async doRunDriveCheck(novelId: number): Promise<DriveCheckResult> {
        const workerDir = resolveWorkerDir();
        const script = path.join(workerDir, 'drive_check.py');
        if (!existsSync(script)) {
            return { checked: false, folderPath: null, folderId: null, existing: null };
        }
        if (!this.pythonLaunch) {
            this.pythonLaunch = resolvePythonLaunch();
        }
        const python = this.pythonLaunch;
        try {
            const { stdout } = await execFileAsync(
                python.command,
                [...python.prefix, '-u', script, String(novelId)],
                {
                    cwd: workerDir,
                    timeout: DRIVE_CHECK_TIMEOUT_MS,
                    maxBuffer: 64 * 1024 * 1024,
                    windowsHide: true,
                },
            );
            const line = stdout
                .split(/\r?\n/)
                .map((value) => value.trim())
                .filter((value) => value.startsWith('{'))
                .pop();
            if (!line) {
                return { checked: false, folderPath: null, folderId: null, existing: null };
            }
            const parsed = JSON.parse(line!) as {
                ok?: boolean;
                folder_path?: string;
                folder_id?: string;
                existing?: string[];
            };
            if (!parsed.ok) {
                return { checked: false, folderPath: null, folderId: null, existing: null };
            }
            return {
                checked: true,
                folderPath: parsed.folder_path ?? null,
                folderId: parsed.folder_id ?? null,
                existing: new Set(parsed.existing ?? []),
            };
        } catch {
            return { checked: false, folderPath: null, folderId: null, existing: null };
        }
    }

    private async loadFacts(novelId: number): Promise<Mp3Fact[]> {
        const qb = this.chaptersRepository
            .createQueryBuilder('chapter')
            .select('chapter.chapterNumber', 'chapterNumber')
            .addSelect('chapter.mp3Path', 'mp3Path')
            .where('chapter.novelId = :novelId', { novelId });
        const rows = await qb.getRawMany<Record<string, unknown>>();
        return rows
            .map((row) => {
                const chapterNumber = Number(row['chapterNumber']);
                const mp3Path = typeof row['mp3Path'] === 'string' ? row['mp3Path'] : null;
                if (!Number.isInteger(chapterNumber) || chapterNumber <= 0) {
                    return null;
                }
                if (!mp3FileReady(mp3Path)) {
                    return null;
                }
                const resolved = path.isAbsolute(mp3Path!) ? mp3Path! : path.resolve(resolveWorkerDir(), mp3Path!);
                const fileName = workerFileName(resolved);
                if (!fileName) {
                    return null;
                }
                return {
                    chapterNumber,
                    fileName,
                    sizeBytes: this.fileSize(resolved),
                };
            })
            .filter((fact): fact is Mp3Fact => fact !== null && fact.fileName.length > 0)
            .sort((a, b) => a.chapterNumber - b.chapterNumber);
    }

    private fileSize(filePath: string): number {
        try {
            return statSync(filePath).size;
        } catch {
            return 0;
        }
    }
}