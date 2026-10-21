import { HttpException, HttpStatus, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Chapter } from 'src/chapters/chapters.entity';
import { throwIf, throwUnless } from 'src/common/utils/throw-if';
import { CrawlService } from 'src/crawl/crawl.service';
import { DriveService } from 'src/drive/drive.service';
import { NovelsService } from 'src/novels/novels.service';
import { TtsService } from 'src/tts/tts.service';
import { formatCrawlChapterRange } from './crawl-range';
import { CreateScheduleRequest } from './dtos/requests/create-schedule.request';
import { UpdateScheduleRequest } from './dtos/requests/update-schedule.request';
import { ScheduleResponse } from './dtos/responses/schedule.response';
import { CrawlSchedule, type ScheduleLastStatus } from './entities/schedule.entity';
import { computeNextRun, isValidTimeOfDay, normalizeDaysOfWeek } from './schedule-time';

const TICK_MS = 15_000;

@Injectable()
export class SchedulesService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(SchedulesService.name);
    private timer: NodeJS.Timeout | null = null;
    private ticking = false;

    constructor(
        @InjectRepository(CrawlSchedule)
        private readonly schedulesRepository: Repository<CrawlSchedule>,
        @InjectRepository(Chapter)
        private readonly chaptersRepository: Repository<Chapter>,
        private readonly novelsService: NovelsService,
        private readonly crawlService: CrawlService,
        private readonly ttsService: TtsService,
        private readonly driveService: DriveService,
    ) {}

    onModuleInit(): void {
        if (process.env.JEST_WORKER_ID || process.env.SCHEDULES_AUTOSTART === '0') {
            return;
        }
        void this.normalizeNextRuns();
        this.timer = setInterval(() => void this.tick(), TICK_MS);
        this.timer.unref?.();
        setTimeout(() => void this.tick(), 3_000).unref?.();
    }

    onModuleDestroy(): void {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    async list(): Promise<ScheduleResponse[]> {
        const rows = await this.schedulesRepository.find({
            relations: { novel: true },
            order: { id: 'DESC' },
        });
        return rows.map((row) => this.toResponse(row));
    }

    async create(request: CreateScheduleRequest): Promise<ScheduleResponse> {
        const novel = await this.novelsService.findOne(request.novelId);
        const daysOfWeek = normalizeDaysOfWeek(request.daysOfWeek);
        throwUnless(daysOfWeek.length > 0, 'Chọn ít nhất một ngày trong tuần', HttpStatus.BAD_REQUEST);
        throwUnless(isValidTimeOfDay(request.timeOfDay), 'Giờ phải có dạng HH:mm', HttpStatus.BAD_REQUEST);

        const active = request.active ?? true;
        const saved = await this.schedulesRepository.save(
            this.schedulesRepository.create({
                novelId: novel.id,
                novel,
                daysOfWeek,
                timeOfDay: request.timeOfDay,
                autoCrawl: request.autoCrawl ?? true,
                autoTts: request.autoTts ?? true,
                autoDrive: request.autoDrive ?? true,
                active,
                runStage: 'idle',
                lastStatus: null,
                lastMessage: null,
                lastRunAt: null,
                nextRunAt: active ? computeNextRun(daysOfWeek, request.timeOfDay, new Date()) : null,
                lastNewChapters: null,
                crawlJobId: null,
                ttsJobId: null,
                driveJobId: null,
            }),
        );
        return this.toResponse(saved);
    }

    async update(id: number, request: UpdateScheduleRequest): Promise<ScheduleResponse> {
        const schedule = await this.schedulesRepository.findOne({ where: { id }, relations: { novel: true } });
        throwUnless(schedule, 'Không tìm thấy lịch định kỳ', HttpStatus.NOT_FOUND);

        if (request.novelId != null && request.novelId !== schedule.novelId) {
            const novel = await this.novelsService.findOne(request.novelId);
            schedule.novel = novel;
            schedule.novelId = novel.id;
        }
        if (request.daysOfWeek != null) {
            const daysOfWeek = normalizeDaysOfWeek(request.daysOfWeek);
            throwUnless(daysOfWeek.length > 0, 'Chọn ít nhất một ngày trong tuần', HttpStatus.BAD_REQUEST);
            schedule.daysOfWeek = daysOfWeek;
        }
        if (request.timeOfDay != null) {
            throwUnless(isValidTimeOfDay(request.timeOfDay), 'Giờ phải có dạng HH:mm', HttpStatus.BAD_REQUEST);
            schedule.timeOfDay = request.timeOfDay;
        }
        if (request.autoCrawl != null) {
            schedule.autoCrawl = request.autoCrawl;
        }
        if (request.autoTts != null) {
            schedule.autoTts = request.autoTts;
        }
        if (request.autoDrive != null) {
            schedule.autoDrive = request.autoDrive;
        }
        if (request.active != null) {
            schedule.active = request.active;
        }

        const scheduleChanged = request.daysOfWeek != null || request.timeOfDay != null || request.active != null;
        if (!schedule.active) {
            schedule.nextRunAt = null;
        } else if (scheduleChanged || !schedule.nextRunAt) {
            schedule.nextRunAt = computeNextRun(schedule.daysOfWeek, schedule.timeOfDay, new Date()) ?? schedule.nextRunAt;
        }

        const saved = await this.schedulesRepository.save(schedule);
        return this.toResponse(saved);
    }

    async remove(id: number): Promise<{ ok: true }> {
        const schedule = await this.schedulesRepository.findOneBy({ id });
        throwUnless(schedule, 'Không tìm thấy lịch định kỳ', HttpStatus.NOT_FOUND);
        throwIf(schedule.runStage !== 'idle', 'Lịch đang chạy. Đợi xong hoặc tắt lịch rồi xóa.', HttpStatus.CONFLICT);
        await this.schedulesRepository.delete({ id });
        return { ok: true };
    }

    /** Chạy ngay một lần, không đổi lịch kế tiếp. */
    async runNow(id: number): Promise<ScheduleResponse> {
        const schedule = await this.schedulesRepository.findOne({ where: { id }, relations: { novel: true } });
        throwUnless(schedule, 'Không tìm thấy lịch định kỳ', HttpStatus.NOT_FOUND);
        throwIf(schedule.runStage !== 'idle', 'Lịch đang chạy. Đợi xong rồi chạy lại.', HttpStatus.CONFLICT);
        await this.beginRun(schedule);
        const saved = await this.schedulesRepository.findOne({ where: { id }, relations: { novel: true } });
        throwUnless(saved, 'Không tìm thấy lịch định kỳ', HttpStatus.NOT_FOUND);
        return this.toResponse(saved);
    }

    private async normalizeNextRuns(): Promise<void> {
        try {
            const rows = await this.schedulesRepository.find();
            for (const row of rows) {
                if (!row.active) {
                    if (row.nextRunAt) {
                        await this.schedulesRepository.update(row.id, { nextRunAt: null });
                    }
                    continue;
                }
                if (!row.nextRunAt) {
                    const nextRunAt = computeNextRun(row.daysOfWeek, row.timeOfDay, new Date());
                    if (nextRunAt) {
                        await this.schedulesRepository.update(row.id, { nextRunAt });
                    }
                }
            }
        } catch (error) {
            this.logger.warn(`Không chuẩn hóa được lịch định kỳ: ${error instanceof Error ? error.message : error}`);
        }
    }

    private async tick(): Promise<void> {
        if (this.ticking) {
            return;
        }
        this.ticking = true;
        try {
            const rows = await this.schedulesRepository.find({
                where: [{ runStage: Not('idle') }, { active: true }],
                relations: { novel: true },
                order: { id: 'ASC' },
            });
            const now = new Date();
            for (const schedule of rows) {
                try {
                    if (schedule.runStage !== 'idle') {
                        await this.advance(schedule);
                        continue;
                    }
                    if (!schedule.active || !schedule.nextRunAt) {
                        continue;
                    }
                    if (new Date(schedule.nextRunAt).getTime() > now.getTime()) {
                        continue;
                    }
                    await this.schedulesRepository.update(schedule.id, {
                        nextRunAt: computeNextRun(schedule.daysOfWeek, schedule.timeOfDay, new Date(now.getTime() + 1_000)),
                    });
                    await this.beginRun(schedule);
                } catch (error) {
                    this.logger.error(`Lịch #${schedule.id} lỗi: ${error instanceof Error ? error.message : error}`);
                    await this.finish(schedule.id, 'failed', errorMessage(error));
                }
            }
        } catch (error) {
            this.logger.warn(`Không đọc được lịch định kỳ: ${error instanceof Error ? error.message : error}`);
        } finally {
            this.ticking = false;
        }
    }

    /**
     * Bắt đầu một lần chạy: đồng bộ danh sách chương, rồi quyết định cào / TTS / Drive.
     * Claim bằng update có điều kiện runStage='idle' để tick và "chạy ngay" không chạy trùng.
     */
    private async beginRun(schedule: CrawlSchedule): Promise<void> {
        const claimed = await this.schedulesRepository.update(
            { id: schedule.id, runStage: 'idle' },
            {
                runStage: 'sync',
                lastStatus: 'running',
                lastMessage: 'Đang kiểm tra chương mới',
                lastRunAt: new Date(),
                lastNewChapters: null,
                crawlJobId: null,
                ttsJobId: null,
                driveJobId: null,
            },
        );
        if (!claimed.affected) {
            return;
        }

        try {
            const previousMaxChapter = await this.maxChapterNumber(schedule.novelId);
            const sync = await this.novelsService.syncChapters(schedule.novelId);
            const newChapters = sync.synced;
            await this.schedulesRepository.update(schedule.id, { lastNewChapters: newChapters });

            if (!schedule.autoCrawl) {
                await this.finish(schedule.id, 'skipped', `Đã cập nhật danh sách chương (+${newChapters}). Tự động cào đang tắt.`);
                return;
            }

            if (newChapters > 0) {
                // Chỉ cào đúng các chương vừa được thêm, không kéo theo chương cũ còn thiếu.
                const numbers = await this.chapterNumbersAbove(schedule.novelId, previousMaxChapter);
                if (numbers.length > 0) {
                    try {
                        const job = await this.crawlService.create({
                            novelId: schedule.novelId,
                            scope: 'chapters',
                            chapterRange: formatCrawlChapterRange(numbers),
                        });
                        await this.schedulesRepository.update(schedule.id, {
                            runStage: 'crawl',
                            crawlJobId: job.id,
                            lastMessage: `Có ${numbers.length} chương mới — đang cào`,
                        });
                        return;
                    } catch (error) {
                        if (!isNoContentError(error)) {
                            throw error;
                        }
                    }
                }
            }

            // Không có chương mới cần cào: vẫn xử lý phần còn thiếu để lần chạy trước lỗi có thể tự phục hồi.
            await this.continueAfterCrawl(schedule, newChapters);
        } catch (error) {
            await this.finish(schedule.id, 'failed', errorMessage(error));
        }
    }

    private async maxChapterNumber(novelId: number): Promise<number> {
        const row = await this.chaptersRepository
            .createQueryBuilder('chapter')
            .select('MAX(chapter.chapterNumber)', 'maxNumber')
            .where('chapter.novelId = :novelId', { novelId })
            .getRawOne<{ maxNumber: number | string | null }>();
        const value = Number(row?.maxNumber ?? 0);
        return Number.isInteger(value) && value > 0 ? value : 0;
    }

    private async chapterNumbersAbove(novelId: number, chapterNumber: number): Promise<number[]> {
        const rows = await this.chaptersRepository
            .createQueryBuilder('chapter')
            .select('chapter.chapterNumber', 'chapterNumber')
            .where('chapter.novelId = :novelId', { novelId })
            .andWhere('chapter.chapterNumber > :chapterNumber', { chapterNumber })
            .orderBy('chapter.chapterNumber', 'ASC')
            .getRawMany<{ chapterNumber: number | string }>();
        return rows.map((row) => Number(row.chapterNumber)).filter((number) => Number.isInteger(number) && number > chapterNumber);
    }

    private async advance(schedule: CrawlSchedule): Promise<void> {
        if (schedule.runStage === 'sync') {
            // Đang đồng bộ danh sách chương (beginRun đang chờ HTTP). Nếu quá lâu thì coi như treo.
            const startedAt = schedule.lastRunAt ? new Date(schedule.lastRunAt).getTime() : 0;
            if (startedAt > 0 && Date.now() - startedAt > 10 * 60_000) {
                await this.finish(schedule.id, 'failed', 'Đồng bộ danh sách chương quá lâu');
            }
            return;
        }
        if (schedule.runStage === 'crawl') {
            await this.advanceCrawl(schedule);
            return;
        }
        if (schedule.runStage === 'tts') {
            await this.advanceTts(schedule);
            return;
        }
        if (schedule.runStage === 'drive') {
            await this.advanceDrive(schedule);
        }
    }

    private async advanceCrawl(schedule: CrawlSchedule): Promise<void> {
        if (!schedule.crawlJobId) {
            await this.finish(schedule.id, 'failed', 'Mất liên kết job cào');
            return;
        }
        const job = await this.crawlService.getOne(schedule.crawlJobId).catch(() => null);
        if (!job) {
            await this.finish(schedule.id, 'failed', 'Job cào không còn tồn tại');
            return;
        }
        if (job.status === 'completed' || job.status === 'completed_with_errors') {
            await this.schedulesRepository.update(schedule.id, { lastMessage: 'Cào xong — chuẩn bị tạo audio' });
            await this.continueAfterCrawl(schedule, schedule.lastNewChapters ?? 0);
            return;
        }
        if (job.status === 'failed' || job.status === 'cancelled') {
            await this.finish(schedule.id, 'failed', job.errorMessage || 'Cào chương mới thất bại');
            return;
        }
        const detail = job.status === 'waiting_for_manual_action' ? 'Đang chờ xử lý captcha trên trình duyệt của worker' : job.progress.detail || 'Đang cào chương mới';
        await this.schedulesRepository.update(schedule.id, { lastMessage: detail });
    }

    private async advanceTts(schedule: CrawlSchedule): Promise<void> {
        if (!schedule.ttsJobId) {
            await this.finish(schedule.id, 'failed', 'Mất liên kết job TTS');
            return;
        }
        const job = await this.ttsService.getById(schedule.ttsJobId).catch(() => null);
        if (!job) {
            await this.finish(schedule.id, 'failed', 'Job TTS không còn tồn tại');
            return;
        }
        if (job.status === 'completed') {
            await this.schedulesRepository.update(schedule.id, { lastMessage: 'Tạo audio xong — chuẩn bị đẩy Drive' });
            await this.continueAfterTts(schedule);
            return;
        }
        if (job.status === 'failed' || job.status === 'stopped') {
            await this.finish(schedule.id, 'failed', job.errorMessage || 'Tạo audio thất bại');
            return;
        }
        await this.schedulesRepository.update(schedule.id, {
            lastMessage: job.progress.detail ? `Đang tạo audio: ${job.progress.detail}` : 'Đang tạo audio',
        });
    }

    private async advanceDrive(schedule: CrawlSchedule): Promise<void> {
        if (!schedule.driveJobId) {
            await this.finish(schedule.id, 'failed', 'Mất liên kết job Drive');
            return;
        }
        const job = await this.driveService.getById(schedule.driveJobId).catch(() => null);
        if (!job) {
            await this.finish(schedule.id, 'failed', 'Job Drive không còn tồn tại');
            return;
        }
        if (job.status === 'completed') {
            const parts = [`${job.progress.done} upload`];
            if (job.progress.skipped > 0) {
                parts.push(`${job.progress.skipped} bỏ qua`);
            }
            if (job.progress.failed > 0) {
                parts.push(`${job.progress.failed} lỗi`);
            }
            await this.finish(schedule.id, 'completed', `Đã đẩy Drive: ${parts.join(' · ')}`);
            return;
        }
        if (job.status === 'failed' || job.status === 'stopped') {
            await this.finish(schedule.id, 'failed', job.errorMessage || 'Đẩy Drive thất bại');
            return;
        }
        await this.schedulesRepository.update(schedule.id, {
            lastMessage: job.progress.detail ? `Đang đẩy Drive: ${job.progress.detail}` : 'Đang đẩy Drive',
        });
    }

    /** Sau khi cào xong (hoặc không có chương mới): chuyển sang TTS nếu còn thiếu, rồi Drive. */
    private async continueAfterCrawl(schedule: CrawlSchedule, newChapters: number): Promise<void> {
        if (schedule.autoTts) {
            const preview = await this.ttsService.preview(schedule.novelId);
            if (preview.missing > 0) {
                const job = await this.ttsService.start({ novelId: schedule.novelId, scope: 'missing' });
                await this.schedulesRepository.update(schedule.id, {
                    runStage: 'tts',
                    ttsJobId: job.id,
                    lastMessage: `Đang tạo audio ${preview.missing} chương`,
                });
                return;
            }
        }
        await this.continueAfterTts(schedule, newChapters);
    }

    /** Sau khi TTS xong (hoặc không cần TTS): đẩy Drive nếu được bật. */
    private async continueAfterTts(schedule: CrawlSchedule, newChapters?: number): Promise<void> {
        if (schedule.autoDrive) {
            const preview = await this.driveService.preview(schedule.novelId);
            if (preview.totalFiles === 0) {
                await this.finish(schedule.id, 'skipped', 'Chưa có file MP3 để đẩy Drive');
                return;
            }
            if (preview.driveChecked && preview.missingOnDrive === 0) {
                await this.finish(schedule.id, 'completed', 'Drive đã đủ file MP3');
                return;
            }
            const job = await this.driveService.start({ novelId: schedule.novelId, scope: 'missing' });
            await this.schedulesRepository.update(schedule.id, {
                runStage: 'drive',
                driveJobId: job.id,
                lastMessage: 'Đang đẩy MP3 lên Drive',
            });
            return;
        }

        const count = newChapters ?? schedule.lastNewChapters ?? 0;
        if (count > 0) {
            await this.finish(schedule.id, 'completed', `Đã cào ${count} chương mới`);
        } else {
            await this.finish(schedule.id, 'skipped', 'Không có chương mới');
        }
    }

    private async finish(id: number, status: Exclude<ScheduleLastStatus, 'running'>, message: string): Promise<void> {
        await this.schedulesRepository.update(id, {
            runStage: 'idle',
            lastStatus: status,
            lastMessage: message,
        });
    }

    private toResponse(schedule: CrawlSchedule): ScheduleResponse {
        return {
            id: schedule.id,
            novelId: schedule.novelId,
            novelTitle: schedule.novel?.title ?? `Truyện #${schedule.novelId}`,
            novelCoverImage: schedule.novel?.coverImage ?? null,
            novelUrl: schedule.novel?.url ?? null,
            daysOfWeek: normalizeDaysOfWeek(schedule.daysOfWeek),
            timeOfDay: schedule.timeOfDay,
            autoCrawl: schedule.autoCrawl,
            autoTts: schedule.autoTts,
            autoDrive: schedule.autoDrive,
            active: schedule.active,
            runStage: schedule.runStage,
            lastStatus: schedule.lastStatus,
            lastMessage: schedule.lastMessage,
            lastRunAt: schedule.lastRunAt,
            nextRunAt: schedule.nextRunAt,
            lastNewChapters: schedule.lastNewChapters,
            crawlJobId: schedule.crawlJobId,
            ttsJobId: schedule.ttsJobId,
            driveJobId: schedule.driveJobId,
            createdAt: schedule.createdAt,
        };
    }
}

function errorMessage(error: unknown): string {
    if (error instanceof HttpException) {
        const response = error.getResponse();
        if (typeof response === 'string') {
            return response;
        }
        if (response && typeof response === 'object' && 'message' in response) {
            const message = (response as { message?: unknown }).message;
            if (Array.isArray(message)) {
                return message.join(', ');
            }
            if (typeof message === 'string') {
                return message;
            }
        }
        return error.message;
    }
    return error instanceof Error ? error.message : 'Lỗi không xác định';
}

function isNoContentError(error: unknown): boolean {
    return errorMessage(error).includes('Không còn chương chưa có nội dung');
}
