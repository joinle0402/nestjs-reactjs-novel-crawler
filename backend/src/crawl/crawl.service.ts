import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Chapter } from 'src/chapters/chapters.entity';
import { JobStatus } from 'src/common/enums/job-status.enum';
import { throwIf, throwUnless } from 'src/common/utils/throw-if';
import { Novel } from 'src/novels/entities/novel.entity';
import { NovelsService } from 'src/novels/novels.service';
import { ChapterRangeParseError, formatChapterList, parseChapterRange } from 'src/tts/chapter-range';
import { CreateCrawlJobRequest, ListCrawlChaptersQuery, ListCrawlJobsQuery } from './dtos/requests/crawl.request';
import { CrawlJobChapterResponse, CrawlJobListResponse, CrawlJobProgress, CrawlJobResponse, CrawlLookupResponse } from './dtos/responses/crawl.response';
import { CrawlJobChapter } from './entities/crawl-job-chapter.entity';
import { CRAWL_ACTIVE_STATUSES, CrawlJob, type CrawlJobStatus, type CrawlScope } from './entities/crawl-job.entity';
import { NovelUrlError, normalizeNovelUrl } from './novel-url';

const CRAWL_JOB_LOCK = 'novel_crawler_crawl_job';
const RECENT_JOB_MS = 20_000;
const MIN_CONTENT_LENGTH = 50;

type ChapterFact = {
    id: number;
    chapterNumber: number;
    crawlStatus: string;
    hasContent: boolean;
};

type ChapterCounts = {
    completed: number;
    failed: number;
    skipped: number;
    pending: number;
    running: number;
    currentChapterNumber: number | null;
};

@Injectable()
export class CrawlService {
    constructor(
        @InjectRepository(CrawlJob)
        private readonly jobsRepository: Repository<CrawlJob>,
        @InjectRepository(CrawlJobChapter)
        private readonly jobChaptersRepository: Repository<CrawlJobChapter>,
        @InjectRepository(Chapter)
        private readonly chaptersRepository: Repository<Chapter>,
        @InjectRepository(Novel)
        private readonly novelsRepository: Repository<Novel>,
        private readonly novelsService: NovelsService,
        private readonly dataSource: DataSource,
    ) {}

    async lookup(url: string): Promise<CrawlLookupResponse> {
        const normalized = this.normalize(url);
        const novel = await this.novelsRepository.findOne({ where: { url: normalized } });
        if (!novel) {
            return { url: normalized, novelId: null, title: null, total: 0, missing: 0, failed: 0 };
        }
        const facts = await this.loadFacts(novel.id);
        return {
            url: normalized,
            novelId: novel.id,
            title: novel.title,
            total: facts.length,
            missing: facts.filter((fact) => !fact.hasContent).length,
            failed: facts.filter((fact) => fact.crawlStatus === JobStatus.FAILED).length,
        };
    }

    async create(request: CreateCrawlJobRequest): Promise<CrawlJobResponse> {
        const resolved = await this.resolveTarget(request);
        const saved = await this.insertJob(resolved);
        return this.toResponse(saved);
    }

    async list(query: ListCrawlJobsQuery): Promise<CrawlJobListResponse> {
        const page = query.page ?? 1;
        const limit = query.limit ?? 20;
        const where: { status?: CrawlJobStatus; novelId?: number } = {};
        if (query.status) {
            where.status = query.status;
        }
        if (query.novelId) {
            where.novelId = query.novelId;
        }
        const [jobs, total] = await this.jobsRepository.findAndCount({
            where,
            order: { id: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });
        const items = await Promise.all(jobs.map((job) => this.toResponse(job)));
        return { items, total };
    }

    async getOne(id: number): Promise<CrawlJobResponse> {
        const job = await this.jobsRepository.findOneBy({ id });
        throwUnless(job, 'Không tìm thấy job cào', HttpStatus.NOT_FOUND);
        return this.toResponse(job);
    }

    async chapters(id: number, query: ListCrawlChaptersQuery): Promise<CrawlJobChapterResponse[]> {
        await this.getOne(id);
        const rows = await this.jobChaptersRepository.find({
            where: { jobId: id, ...(query.status ? { status: query.status } : {}) },
            order: { chapterNumber: 'ASC' },
        });
        return rows.map((row) => this.toChapter(row));
    }

    async pause(id: number): Promise<CrawlJobResponse> {
        return this.transition(id, ['running'], 'paused', false);
    }

    async resume(id: number): Promise<CrawlJobResponse> {
        return this.transition(id, ['paused'], 'running', false);
    }

    async continueManual(id: number): Promise<CrawlJobResponse> {
        return this.transition(id, ['waiting_for_manual_action'], 'running', false);
    }

    async cancel(id: number): Promise<CrawlJobResponse> {
        const job = await this.transition(id, CRAWL_ACTIVE_STATUSES, 'cancelled', true);
        if (job.novelId) {
            await this.chaptersRepository.update(
                { novelId: job.novelId, crawlStatus: JobStatus.PROCESSING },
                { crawlStatus: JobStatus.PENDING },
            );
        }
        await this.jobChaptersRepository.update({ jobId: id, status: 'running' }, { status: 'pending', finishedAt: null });
        return this.getOne(id);
    }

    async retry(id: number): Promise<CrawlJobResponse> {
        const source = await this.jobsRepository.findOneBy({ id });
        throwUnless(source, 'Không tìm thấy job cào', HttpStatus.NOT_FOUND);
        throwUnless(source.novelId, 'Job chưa gắn truyện nên không cào lại được');
        const failed = await this.jobChaptersRepository.find({
            where: { jobId: id, status: 'failed' },
            order: { chapterNumber: 'ASC' },
        });
        throwUnless(failed.length > 0, 'Job không có chương lỗi để cào lại');
        const numbers = failed.map((row) => row.chapterNumber);
        const saved = await this.insertJob({
            novelId: source.novelId,
            url: source.url,
            scope: 'chapters',
            chapterRange: formatChapterList(numbers, '-', ','),
            chapterNumbers: numbers,
            totalChapters: numbers.length,
        });
        return this.toResponse(saved);
    }

    async getCurrent(): Promise<CrawlJobResponse | null> {
        const active = await this.jobsRepository.findOne({
            where: { status: In(CRAWL_ACTIVE_STATUSES) },
            order: { id: 'ASC' },
        });
        if (active) {
            return this.toResponse(active);
        }
        const recent = await this.jobsRepository.findOne({
            where: { status: In(['completed', 'completed_with_errors', 'failed', 'cancelled']) },
            order: { id: 'DESC' },
        });
        if (!recent?.finishedAt) {
            return null;
        }
        if (Date.now() - new Date(recent.finishedAt).getTime() > RECENT_JOB_MS) {
            return null;
        }
        return this.toResponse(recent);
    }

    private async resolveTarget(request: CreateCrawlJobRequest): Promise<{
        novelId: number | null;
        url: string;
        scope: CrawlScope;
        chapterRange: string | null;
        chapterNumbers: number[] | null;
        totalChapters: number | null;
    }> {
        throwUnless(request.url?.trim() || request.novelId, 'Nhập URL hoặc chọn truyện');
        let novelId = request.novelId ?? null;
        let url = request.url?.trim() ? this.normalize(request.url) : '';
        if (novelId) {
            const novel = await this.novelsService.findOne(novelId);
            if (url) {
                throwUnless(novel.url === url, 'URL không khớp truyện đã chọn');
            } else {
                url = novel.url;
            }
        } else {
            const existing = await this.novelsRepository.findOne({ where: { url } });
            novelId = existing?.id ?? null;
        }

        const facts = novelId ? await this.loadFacts(novelId) : [];
        const maxChapter = facts.length > 0 ? Math.max(...facts.map((fact) => fact.chapterNumber)) : null;

        if (request.scope === 'failed') {
            throwUnless(novelId, 'Chưa có truyện để cào lại chương lỗi');
            const numbers = facts.filter((fact) => fact.crawlStatus === JobStatus.FAILED).map((fact) => fact.chapterNumber);
            throwUnless(numbers.length > 0, 'Không có chương lỗi');
            return { novelId, url, scope: 'failed', chapterRange: null, chapterNumbers: numbers, totalChapters: numbers.length };
        }

        if (request.scope === 'missing') {
            if (facts.length === 0) {
                return { novelId, url, scope: 'missing', chapterRange: null, chapterNumbers: null, totalChapters: null };
            }
            const numbers = facts.filter((fact) => !fact.hasContent).map((fact) => fact.chapterNumber);
            throwUnless(numbers.length > 0, 'Không còn chương chưa có nội dung');
            return { novelId, url, scope: 'missing', chapterRange: null, chapterNumbers: numbers, totalChapters: numbers.length };
        }

        const text = request.chapterRange?.trim() ?? '';
        throwUnless(text, 'Nhập phạm vi chương');
        let parsed: ReturnType<typeof parseChapterRange>;
        try {
            parsed = parseChapterRange(text, { maxAvailable: facts.length > 0 ? maxChapter : null, useDefaultOnEmpty: false });
        } catch (error) {
            if (error instanceof ChapterRangeParseError) {
                throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
            }
            throw error;
        }
        if (parsed.kind === 'all') {
            const numbers = facts.length > 0 ? facts.map((fact) => fact.chapterNumber) : null;
            return {
                novelId,
                url,
                scope: 'chapters',
                chapterRange: text,
                chapterNumbers: numbers,
                totalChapters: numbers?.length ?? null,
            };
        }
        return {
            novelId,
            url,
            scope: 'chapters',
            chapterRange: text,
            chapterNumbers: parsed.numbers,
            totalChapters: parsed.numbers.length,
        };
    }

    private async insertJob(input: {
        novelId: number | null;
        url: string;
        scope: CrawlScope;
        chapterRange: string | null;
        chapterNumbers: number[] | null;
        totalChapters: number | null;
    }): Promise<CrawlJob> {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();
        let acquired = false;
        try {
            await queryRunner.startTransaction();
            const locked = await queryRunner.query('SELECT GET_LOCK(?, 10) AS got', [CRAWL_JOB_LOCK]);
            acquired = this.lockAcquired(locked);
            throwUnless(acquired, 'Không lấy được khóa job cào', HttpStatus.CONFLICT);
            const active = await queryRunner.manager.count(CrawlJob, { where: { status: In(CRAWL_ACTIVE_STATUSES) } });
            throwIf(active > 0, 'Đang có job cào khác. Hủy job hiện tại trước khi tạo mới.', HttpStatus.CONFLICT);
            const job = queryRunner.manager.create(CrawlJob, {
                novelId: input.novelId,
                url: input.url,
                scope: input.scope,
                chapterRange: input.chapterRange,
                chapterNumbers: input.chapterNumbers,
                status: 'pending' satisfies CrawlJobStatus,
                totalChapters: input.totalChapters,
                currentChapter: null,
                errorMessage: null,
                startedAt: null,
                finishedAt: null,
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
                    await queryRunner.query('SELECT RELEASE_LOCK(?)', [CRAWL_JOB_LOCK]);
                } catch {
                    // connection có thể đã đóng sau rollback
                }
            }
            await queryRunner.release();
        }
    }

    private async transition(id: number, from: CrawlJobStatus[], to: CrawlJobStatus, finish: boolean): Promise<CrawlJobResponse> {
        const job = await this.jobsRepository.findOneBy({ id });
        throwUnless(job, 'Không tìm thấy job cào', HttpStatus.NOT_FOUND);
        throwUnless(from.includes(job.status), 'Job không ở trạng thái cho phép thao tác này', HttpStatus.CONFLICT);
        const result = await this.jobsRepository.update(
            { id, status: In(from) },
            { status: to, ...(finish ? { finishedAt: new Date() } : {}) },
        );
        throwUnless(result.affected, 'Job đã đổi trạng thái', HttpStatus.CONFLICT);
        return this.getOne(id);
    }

    private async toResponse(job: CrawlJob): Promise<CrawlJobResponse> {
        const novel = job.novelId ? await this.novelsService.findOne(job.novelId).catch(() => null) : null;
        const counts = await this.counts(job.id);
        return {
            id: job.id,
            novelId: job.novelId,
            novelTitle: novel?.title ?? null,
            url: job.url,
            scope: job.scope,
            chapterRange: job.chapterRange,
            chapterNumbers: this.numbersOf(job),
            status: job.status,
            errorMessage: job.errorMessage,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt,
            createdAt: job.createdAt,
            progress: this.progress(job, counts),
        };
    }

    private progress(job: CrawlJob, counts: ChapterCounts): CrawlJobProgress {
        const known = counts.completed + counts.failed + counts.skipped + counts.pending + counts.running;
        const total = known > 0 ? known : (job.totalChapters ?? 0);
        const settled = counts.completed + counts.skipped;
        const percent = total > 0 ? Math.floor((settled * 100) / total) : null;
        const current = counts.currentChapterNumber ?? job.currentChapter;
        let detail = total > 0 ? `xong ${counts.completed}/${total}` : 'Đang lấy danh sách chương';
        if (job.status === 'waiting_for_manual_action') {
            detail = job.errorMessage || 'Cần giải captcha trên trình duyệt của worker';
        } else if (current) {
            detail = `Ch.${current} — xong ${counts.completed}/${total || '?'}`;
        }
        return {
            total,
            completed: counts.completed,
            failed: counts.failed,
            skipped: counts.skipped,
            pending: counts.pending,
            currentChapterNumber: current,
            percent,
            detail,
        };
    }

    private async counts(jobId: number): Promise<ChapterCounts> {
        const rows = await this.jobChaptersRepository
            .createQueryBuilder('row')
            .select('row.status', 'status')
            .addSelect('COUNT(*)', 'count')
            .addSelect('MIN(CASE WHEN row.status = :running THEN row.chapterNumber END)', 'currentChapter')
            .where('row.jobId = :jobId', { jobId, running: 'running' })
            .groupBy('row.status')
            .getRawMany<Record<string, unknown>>();
        const counts: ChapterCounts = { completed: 0, failed: 0, skipped: 0, pending: 0, running: 0, currentChapterNumber: null };
        for (const row of rows) {
            const status = String(this.raw(row, 'status'));
            const count = Number(this.raw(row, 'count') ?? 0);
            if (status === 'completed' || status === 'failed' || status === 'skipped' || status === 'pending' || status === 'running') {
                counts[status] = count;
            }
            const current = this.raw(row, 'currentChapter');
            if (current != null && counts.currentChapterNumber == null) {
                counts.currentChapterNumber = Number(current);
            }
        }
        return counts;
    }

    private async loadFacts(novelId: number): Promise<ChapterFact[]> {
        const rows = await this.chaptersRepository
            .createQueryBuilder('chapter')
            .select('chapter.id', 'id')
            .addSelect('chapter.chapterNumber', 'chapterNumber')
            .addSelect('chapter.crawlStatus', 'crawlStatus')
            .addSelect('CHAR_LENGTH(TRIM(chapter.content))', 'contentLength')
            .where('chapter.novelId = :novelId', { novelId })
            .getRawMany<Record<string, unknown>>();
        return rows
            .map((row) => {
                const contentLength = Number(this.raw(row, 'contentLength') ?? 0);
                return {
                    id: Number(this.raw(row, 'id')),
                    chapterNumber: Number(this.raw(row, 'chapterNumber')),
                    crawlStatus: String(this.raw(row, 'crawlStatus') ?? JobStatus.PENDING),
                    hasContent: Number.isFinite(contentLength) && contentLength > MIN_CONTENT_LENGTH,
                };
            })
            .filter((fact) => Number.isInteger(fact.chapterNumber) && fact.chapterNumber > 0)
            .sort((a, b) => a.chapterNumber - b.chapterNumber);
    }

    private toChapter(row: CrawlJobChapter): CrawlJobChapterResponse {
        return {
            id: row.id,
            chapterNumber: row.chapterNumber,
            chapterId: row.chapterId,
            title: row.title,
            status: row.status,
            attemptCount: row.attemptCount,
            errorMessage: row.errorMessage,
            startedAt: row.startedAt,
            finishedAt: row.finishedAt,
        };
    }

    private numbersOf(job: CrawlJob): number[] | null {
        const value = job.chapterNumbers as unknown;
        if (value == null) {
            return null;
        }
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

    private normalize(url: string): string {
        try {
            return normalizeNovelUrl(url);
        } catch (error) {
            if (error instanceof NovelUrlError) {
                throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
            }
            throw error;
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
