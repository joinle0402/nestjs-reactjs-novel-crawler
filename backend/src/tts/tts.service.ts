import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { throwIf, throwUnless } from 'src/common/utils/throw-if';
import { JobStatus } from 'src/common/enums/job-status.enum';
import { Chapter } from 'src/chapters/chapters.entity';
import { NovelsService } from 'src/novels/novels.service';
import { TtsJob, TTS_ENGINE, type TtsJobStatus, type TtsScope } from './entities/tts-job.entity';
import { TtsSettingsService } from './tts-settings.service';
import { StartTtsJobRequest } from './dtos/requests/start-tts-job.request';
import { TtsJobProgress, TtsJobResponse } from './dtos/responses/tts-job.response';
import { TtsChapterPreview, TtsPreviewResponse } from './dtos/responses/tts-preview.response';
import {
    ChapterRangeParseError,
    formatAllPreviewSentence,
    formatPreviewSentence,
    parseChapterRange,
    type ChapterRange,
} from './chapter-range';
import { mp3FileReady } from './mp3-file';

const TTS_JOB_LOCK = 'novel_crawler_tts_job';
const RECENT_JOB_MS = 20_000;
const MIN_CONTENT_LENGTH = 50;

type ChapterFact = {
    chapterNumber: number;
    ttsStatus: string;
    hasContent: boolean;
    hasMp3: boolean;
    ttsCharsDone: number;
    ttsCharsTotal: number;
};

@Injectable()
export class TtsService {
    constructor(
        @InjectRepository(TtsJob)
        private readonly jobsRepository: Repository<TtsJob>,
        @InjectRepository(Chapter)
        private readonly chaptersRepository: Repository<Chapter>,
        private readonly novelsService: NovelsService,
        private readonly settingsService: TtsSettingsService,
        private readonly dataSource: DataSource,
    ) {}

    async preview(novelId: number, chapterRange?: string): Promise<TtsPreviewResponse> {
        await this.novelsService.findOne(novelId);
        const facts = await this.loadFacts(novelId);
        const missing = facts.filter((fact) => this.runnable(fact)).length;
        const failed = facts.filter((fact) => this.runnable(fact) && fact.ttsStatus === JobStatus.FAILED).length;
        const trimmed = chapterRange?.trim();
        return {
            missing,
            failed,
            chapters: trimmed ? this.chapterPreview(facts, trimmed) : null,
        };
    }

    async start(request: StartTtsJobRequest): Promise<TtsJobResponse> {
        const novel = await this.novelsService.findOne(request.novelId);
        const settings = await this.settingsService.read();
        const engine = request.engine ?? settings.engine;
        const voice = request.voice ?? settings.voice;
        const rate = request.rate ?? settings.rate;
        const bgmEnabled = request.bgmEnabled ?? settings.bgmEnabled;
        throwUnless(engine === TTS_ENGINE, 'Hiện chỉ hỗ trợ engine edge-tts');
        if (request.voice !== undefined) {
            throwUnless(this.settingsService.allowedVoices(settings.voice).has(request.voice), 'Giọng không thuộc edge-tts');
        }

        const facts = await this.loadFacts(novel.id);
        const resolved = this.resolveScope(facts, request.scope, request.chapterRange);
        const saved = await this.insertJob({
            novelId: novel.id,
            scope: request.scope,
            chapterRange: resolved.chapterRange,
            chapterNumbers: resolved.numbers,
            engine,
            voice,
            rate,
            bgmEnabled,
        });
        return this.toResponse(saved, novel.title, facts);
    }

    async stop(): Promise<TtsJobResponse> {
        const active = await this.findActive();
        throwUnless(active, 'Không có job TTS đang chạy', HttpStatus.NOT_FOUND);

        const result = await this.jobsRepository.update(
            { id: active.id, status: In(['pending', 'running']) },
            { status: 'stopped', finishedAt: new Date() },
        );
        throwUnless(result.affected, 'Không có job TTS đang chạy', HttpStatus.NOT_FOUND);

        await this.chaptersRepository.update(
            { novelId: active.novelId, ttsStatus: JobStatus.PROCESSING },
            { ttsStatus: JobStatus.PENDING, ttsCharsDone: 0, ttsCharsTotal: 0 },
        );

        const stopped = await this.jobsRepository.findOneByOrFail({ id: active.id });
        const novel = await this.novelsService.findOne(stopped.novelId);
        return this.toResponse(stopped, novel.title);
    }

    async getCurrent(): Promise<TtsJobResponse | null> {
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

    private async findActive(): Promise<TtsJob | null> {
        return this.jobsRepository.findOne({
            where: [{ status: 'pending' }, { status: 'running' }],
            order: { id: 'ASC' },
        });
    }

    private resolveScope(
        facts: ChapterFact[],
        scope: TtsScope,
        chapterRange: string | undefined,
    ): { chapterRange: string | null; numbers: number[] } {
        if (scope === 'missing') {
            return { chapterRange: null, numbers: this.workNumbers(facts, scope) };
        }
        if (scope === 'failed') {
            return { chapterRange: null, numbers: this.workNumbers(facts, scope) };
        }

        const text = chapterRange?.trim() ?? '';
        throwUnless(text, 'Nhập phạm vi chương');
        let parsed: ChapterRange;
        try {
            parsed = parseChapterRange(text, { maxAvailable: this.maxChapter(facts), useDefaultOnEmpty: false });
        } catch (error) {
            if (error instanceof ChapterRangeParseError) {
                throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
            }
            throw error;
        }
        return { chapterRange: text, numbers: this.workNumbers(facts, scope, parsed) };
    }

    private chapterPreview(facts: ChapterFact[], text: string): TtsChapterPreview {
        try {
            const parsed = parseChapterRange(text, { maxAvailable: this.maxChapter(facts), useDefaultOnEmpty: false });
            if (parsed.kind === 'all') {
                return {
                    error: null,
                    preview: formatAllPreviewSentence(facts.length),
                    count: facts.length,
                    willRun: this.workNumbers(facts, 'chapters', parsed).length,
                };
            }
            return {
                error: null,
                preview: formatPreviewSentence(parsed.numbers),
                count: parsed.numbers.length,
                willRun: this.workNumbers(facts, 'chapters', parsed).length,
            };
        } catch (error) {
            const message = error instanceof ChapterRangeParseError ? error.message : 'Phạm vi chương không hợp lệ';
            return { error: message, preview: null, count: 0, willRun: 0 };
        }
    }

    private workNumbers(facts: ChapterFact[], scope: TtsScope, parsed?: ChapterRange): number[] {
        const runnable = facts.filter((fact) => this.runnable(fact));
        if (scope === 'failed') {
            return runnable.filter((fact) => fact.ttsStatus === JobStatus.FAILED).map((fact) => fact.chapterNumber);
        }
        if (scope === 'missing' || !parsed || parsed.kind === 'all') {
            return runnable.map((fact) => fact.chapterNumber);
        }
        const wanted = new Set(parsed.numbers);
        return runnable.filter((fact) => wanted.has(fact.chapterNumber)).map((fact) => fact.chapterNumber);
    }

    private runnable(fact: ChapterFact): boolean {
        return fact.hasContent && !fact.hasMp3;
    }

    private maxChapter(facts: ChapterFact[]): number | null {
        if (facts.length === 0) {
            return null;
        }
        return Math.max(...facts.map((fact) => fact.chapterNumber));
    }

    private async insertJob(input: {
        novelId: number;
        scope: TtsScope;
        chapterRange: string | null;
        chapterNumbers: number[];
        engine: string;
        voice: string;
        rate: string;
        bgmEnabled: boolean;
    }): Promise<TtsJob> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        let acquired = false;
        try {
            await queryRunner.startTransaction();
            const locked = await queryRunner.query('SELECT GET_LOCK(?, 10) AS got', [TTS_JOB_LOCK]);
            acquired = this.lockAcquired(locked);
            throwUnless(acquired, 'Không lấy được khóa job TTS', HttpStatus.CONFLICT);

            const active = await queryRunner.manager.count(TtsJob, {
                where: { status: In(['pending', 'running']) },
            });
            throwIf(active > 0, 'Đang có job TTS khác. Dừng job hiện tại trước khi tạo mới.', HttpStatus.CONFLICT);

            const job = queryRunner.manager.create(TtsJob, {
                novelId: input.novelId,
                scope: input.scope,
                chapterRange: input.chapterRange,
                chapterNumbers: input.chapterNumbers,
                engine: input.engine,
                voice: input.voice,
                rate: input.rate,
                bgmEnabled: input.bgmEnabled,
                status: 'pending' satisfies TtsJobStatus,
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
                    await queryRunner.query('SELECT RELEASE_LOCK(?)', [TTS_JOB_LOCK]);
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

    private async toResponse(job: TtsJob, novelTitle: string, facts?: ChapterFact[]): Promise<TtsJobResponse> {
        const rows = facts ?? (await this.loadFacts(job.novelId, this.numbersOf(job)));
        return {
            id: job.id,
            novelId: job.novelId,
            novelTitle,
            scope: job.scope,
            chapterRange: job.chapterRange,
            chapterNumbers: this.numbersOf(job),
            engine: job.engine,
            voice: job.voice,
            rate: job.rate,
            bgmEnabled: job.bgmEnabled,
            status: job.status,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
            errorMessage: job.errorMessage,
            progress: this.progress(rows, this.numbersOf(job)),
        };
    }

    private numbersOf(job: TtsJob): number[] {
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

    private progress(facts: ChapterFact[], numbers: number[]): TtsJobProgress {
        const wanted = new Set(numbers);
        const scoped = facts.filter((fact) => wanted.has(fact.chapterNumber));
        const total = numbers.length > 0 ? numbers.length : scoped.length;
        const done = scoped.filter((fact) => fact.hasMp3).length;
        const current = scoped
            .filter((fact) => fact.ttsStatus === JobStatus.PROCESSING)
            .sort((a, b) => a.chapterNumber - b.chapterNumber)[0];
        const currentPercent = current
            ? current.ttsCharsTotal > 0
                ? Math.floor((current.ttsCharsDone * 100) / current.ttsCharsTotal)
                : 0
            : null;
        let detail = `xong ${done}/${total}`;
        if (current && currentPercent != null) {
            detail = `Ch.${current.chapterNumber} — ${currentPercent}%, xong ${done}/${total}`;
        }
        return {
            done,
            total,
            currentChapterNumber: current?.chapterNumber ?? null,
            currentPercent,
            detail,
        };
    }

    private async loadFacts(novelId: number, onlyNumbers?: number[]): Promise<ChapterFact[]> {
        if (onlyNumbers && onlyNumbers.length === 0) {
            return [];
        }
        const qb = this.chaptersRepository
            .createQueryBuilder('chapter')
            .select('chapter.chapterNumber', 'chapterNumber')
            .addSelect('chapter.ttsStatus', 'ttsStatus')
            .addSelect('chapter.mp3Path', 'mp3Path')
            .addSelect('chapter.ttsCharsDone', 'ttsCharsDone')
            .addSelect('chapter.ttsCharsTotal', 'ttsCharsTotal')
            .addSelect('CHAR_LENGTH(TRIM(chapter.content))', 'contentLength')
            .where('chapter.novelId = :novelId', { novelId });
        if (onlyNumbers && onlyNumbers.length > 0) {
            qb.andWhere('chapter.chapterNumber IN (:...onlyNumbers)', { onlyNumbers });
        }
        const rows = await qb.getRawMany<Record<string, unknown>>();
        return rows
            .map((row) => {
                const contentLength = Number(this.raw(row, 'contentLength') ?? 0);
                const mp3Path = this.raw(row, 'mp3Path');
                return {
                    chapterNumber: Number(this.raw(row, 'chapterNumber')),
                    ttsStatus: String(this.raw(row, 'ttsStatus') ?? JobStatus.PENDING),
                    hasContent: Number.isFinite(contentLength) && contentLength > MIN_CONTENT_LENGTH,
                    hasMp3: mp3FileReady(typeof mp3Path === 'string' ? mp3Path : null),
                    ttsCharsDone: Number(this.raw(row, 'ttsCharsDone') ?? 0),
                    ttsCharsTotal: Number(this.raw(row, 'ttsCharsTotal') ?? 0),
                };
            })
            .filter((fact) => Number.isInteger(fact.chapterNumber) && fact.chapterNumber > 0)
            .sort((a, b) => a.chapterNumber - b.chapterNumber);
    }

    private raw(row: Record<string, unknown>, key: string): unknown {
        if (key in row) {
            return row[key];
        }
        const lower = key.toLowerCase();
        if (lower in row) {
            return row[lower];
        }
        return undefined;
    }
}
