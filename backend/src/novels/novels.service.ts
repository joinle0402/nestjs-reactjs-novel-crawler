import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Response } from 'express';
import { throwUnless } from '../common/utils/throw-if';
import { Novel } from './entities/novel.entity';
import { CreateNovelRequest } from './dtos/requests/create-novel.request';
import { UpdateNovelRequest } from './dtos/requests/update-novel.request';
import { Chapter } from '../chapters/chapters.entity';
import { PlaybackState } from './entities/playback-state.entity';
import { NovelStatsResponse } from './dtos/responses/novel-stats.response';
import { NovelListItemResponse, NovelSourceStats, NovelStatsCounts, toNovelStatsResponse, toStatsCounts } from './dtos/responses/novel-list-item.response';
import { UpdatePlaybackRequest } from './dtos/requests/update-playback.request';
import { SyncNovelChaptersResponse } from './dtos/responses/sync-chapters.response';
import { fetchFreeChapterList } from './novel-chapters-sync';
import { detectSourceKind } from '../crawl/novel-url';
import { isRemoteCover, removeStoredCover, resolveStoredCover, saveUploadedCover, type UploadedCover } from './novel-cover';
import { JobStatus } from '../common/enums/job-status.enum';

@Injectable()
export class NovelsService {
    constructor(
        @InjectRepository(Novel)
        private readonly novelsRepository: Repository<Novel>,
        @InjectRepository(Chapter)
        private readonly chaptersRepository: Repository<Chapter>,
        @InjectRepository(PlaybackState)
        private readonly playbackRepository: Repository<PlaybackState>,
    ) {}

    async findAll(): Promise<NovelListItemResponse[]> {
        const novels = await this.novelsRepository.find({
            order: { id: 'DESC' },
        });
        const ids = novels.map((novel) => novel.id);
        const [statsByNovelId, lastActivityByNovelId, sourceStatsByNovelId] = await Promise.all([
            this.getStatsByNovelIds(ids),
            this.getLastActivityByNovelIds(ids),
            this.getSourceStatsByNovelIds(ids),
        ]);

        return novels.map((novel) => ({
            id: novel.id,
            url: novel.url,
            title: novel.title,
            author: novel.author,
            summary: novel.summary,
            coverImage: novel.coverImage,
            createdAt: novel.createdAt,
            lastActivityAt: (lastActivityByNovelId.get(novel.id) ?? novel.createdAt).toISOString(),
            stats: statsByNovelId.get(novel.id) ?? toStatsCounts(),
            sourceStats: sourceStatsByNovelId.get(novel.id) ?? [],
        }));
    }

    async findOne(id: number): Promise<Novel> {
        const model = await this.novelsRepository.findOne({ where: { id } });
        throwUnless(model, 'Novel not found', HttpStatus.NOT_FOUND);
        return model;
    }

    async create(request: CreateNovelRequest): Promise<Novel> {
        const url = request.url.trim();
        const withSlash = url.endsWith('/') ? url : `${url}/`;
        const existing = await this.novelsRepository.findOne({ where: [{ url }, { url: withSlash }] });
        if (existing) {
            existing.title = request.title;
            existing.author = request.author ?? null;
            existing.summary = request.summary ?? null;
            const previous = existing.coverImage;
            if (request.coverImage !== undefined) {
                existing.coverImage = request.coverImage || null;
            }
            const saved = await this.novelsRepository.save(existing);
            if (request.coverImage !== undefined && previous !== saved.coverImage) {
                await removeStoredCover(previous);
            }
            return saved;
        }
        const model = this.novelsRepository.create({ ...request, url, coverImage: request.coverImage || null });
        return this.novelsRepository.save(model);
    }

    async update(id: number, request: UpdateNovelRequest): Promise<Novel> {
        const model = await this.findOne(id);
        const previous = model.coverImage;
        Object.assign(model, request);
        const saved = await this.novelsRepository.save(model);
        if (request.coverImage !== undefined && previous !== saved.coverImage) {
            await removeStoredCover(previous);
        }
        return saved;
    }

    async uploadCover(id: number, file: UploadedCover | undefined): Promise<Novel> {
        const model = await this.findOne(id);
        const previous = model.coverImage;
        model.coverImage = await saveUploadedCover(id, file);
        const saved = await this.novelsRepository.save(model);
        await removeStoredCover(previous);
        return saved;
    }

    async removeCover(id: number): Promise<Novel> {
        const model = await this.findOne(id);
        const previous = model.coverImage;
        model.coverImage = null;
        const saved = await this.novelsRepository.save(model);
        await removeStoredCover(previous);
        return saved;
    }

    async streamCover(id: number, response: Response): Promise<void> {
        const novel = await this.findOne(id);
        throwUnless(novel.coverImage, 'Truyện chưa có ảnh bìa', HttpStatus.NOT_FOUND);
        if (isRemoteCover(novel.coverImage)) {
            await this.proxyRemoteCover(novel.coverImage.trim(), response);
            return;
        }
        const { filePath, contentType } = resolveStoredCover(novel.coverImage);
        response.setHeader('Content-Type', contentType);
        response.setHeader('Cache-Control', 'public, max-age=3600');
        response.sendFile(filePath);
    }

    private async proxyRemoteCover(url: string, response: Response): Promise<void> {
        const remote = await fetch(url).catch(() => null);
        throwUnless(remote?.ok, 'Không tải được ảnh bìa từ nguồn', HttpStatus.BAD_GATEWAY);
        const buffer = Buffer.from(await remote.arrayBuffer());
        response.setHeader('Content-Type', remote.headers.get('content-type') ?? 'image/jpeg');
        response.setHeader('Cache-Control', 'public, max-age=3600');
        response.send(buffer);
    }

    async delete(id: number): Promise<void> {
        const model = await this.findOne(id);
        await this.novelsRepository.remove(model);
        await removeStoredCover(model.coverImage);
    }

    async getStats(id: number): Promise<NovelStatsResponse> {
        const novel = await this.findOne(id);
        const statsByNovelId = await this.getStatsByNovelIds([id]);
        return toNovelStatsResponse(novel.id, novel.title, statsByNovelId.get(id) ?? toStatsCounts());
    }

    async syncChapters(id: number, urlOverride?: string): Promise<SyncNovelChaptersResponse> {
        const novel = await this.findOne(id);
        const sourceUrl = urlOverride?.trim() || novel.url;
        const { chapters, vipCount } = await fetchFreeChapterList(sourceUrl);
        const source = detectSourceKind(sourceUrl);

        const existing = await this.chaptersRepository.find({
            where: { novelId: id },
            select: { chapterSiteId: true },
        });
        const existingSiteIds = new Set(existing.map((chapter) => chapter.chapterSiteId));

        const missing = chapters.map((chapter, index) => ({ ...chapter, number: index + 1 })).filter((chapter) => !existingSiteIds.has(chapter.siteId));

        if (missing.length > 0) {
            await this.chaptersRepository
                .createQueryBuilder()
                .insert()
                .into(Chapter)
                .values(
                    missing.map((chapter) => ({
                        novelId: id,
                        chapterSiteId: chapter.siteId,
                        source,
                        chapterNumber: chapter.number,
                        title: chapter.title.slice(0, 500),
                    })),
                )
                .orIgnore()
                .execute();
        }

        return { synced: missing.length, total: chapters.length, vipCount };
    }

    private async getStatsByNovelIds(ids: number[]): Promise<Map<number, NovelStatsCounts>> {
        const statsByNovelId = new Map<number, NovelStatsCounts>();
        if (ids.length === 0) {
            return statsByNovelId;
        }

        const rows = await this.chaptersRepository
            .createQueryBuilder('chapter')
            .select('chapter.novel_id', 'novelId')
            .addSelect('COUNT(*)', 'total')
            .addSelect('SUM(CASE WHEN chapter.crawl_status = :completed THEN 1 ELSE 0 END)', 'crawled')
            .addSelect("MAX(CASE WHEN chapter.content IS NOT NULL AND chapter.content <> '' THEN chapter.chapter_number END)", 'lastCrawled')
            .addSelect('SUM(CASE WHEN chapter.tts_status = :completed THEN 1 ELSE 0 END)', 'ttsDone')
            .addSelect('SUM(CASE WHEN chapter.crawl_status = :failed THEN 1 ELSE 0 END)', 'crawlFailed')
            .addSelect('SUM(CASE WHEN chapter.tts_status = :failed THEN 1 ELSE 0 END)', 'ttsFailed')
            .where('chapter.novel_id IN (:...ids)', {
                ids,
                completed: JobStatus.COMPLETED,
                failed: JobStatus.FAILED,
            })
            .groupBy('chapter.novel_id')
            .getRawMany<{
                novelId: string | number;
                total: string;
                crawled: string | null;
                lastCrawled: string | null;
                ttsDone: string | null;
                crawlFailed: string | null;
                ttsFailed: string | null;
            }>();

        for (const row of rows) {
            statsByNovelId.set(Number(row.novelId), toStatsCounts(row));
        }
        return statsByNovelId;
    }

    private async getSourceStatsByNovelIds(ids: number[]): Promise<Map<number, NovelSourceStats[]>> {
        const sourceStatsByNovelId = new Map<number, NovelSourceStats[]>();
        if (ids.length === 0) {
            return sourceStatsByNovelId;
        }

        const rows = await this.chaptersRepository
            .createQueryBuilder('chapter')
            .select('chapter.novel_id', 'novelId')
            .addSelect('chapter.source', 'source')
            .addSelect('COUNT(*)', 'total')
            .addSelect('SUM(CASE WHEN chapter.crawl_status = :completed THEN 1 ELSE 0 END)', 'crawled')
            .where('chapter.novel_id IN (:...ids)', { ids, completed: JobStatus.COMPLETED })
            .groupBy('chapter.novel_id')
            .addGroupBy('chapter.source')
            .orderBy('chapter.novel_id', 'DESC')
            .addOrderBy('chapter.source', 'ASC')
            .getRawMany<{
                novelId: string | number;
                source: string | null;
                total: string;
                crawled: string | null;
            }>();

        for (const row of rows) {
            const novelId = Number(row.novelId);
            const list = sourceStatsByNovelId.get(novelId) ?? [];
            list.push({
                source: row.source || 'sangtacviet',
                total: Number(row.total ?? 0),
                crawled: Number(row.crawled ?? 0),
            });
            sourceStatsByNovelId.set(novelId, list);
        }
        return sourceStatsByNovelId;
    }

    private async getLastActivityByNovelIds(ids: number[]): Promise<Map<number, Date>> {
        const lastActivityByNovelId = new Map<number, Date>();
        if (ids.length === 0) {
            return lastActivityByNovelId;
        }

        const placeholders = ids.map(() => '?').join(', ');
        const rows = await this.chaptersRepository.manager.query<Array<{ novelId: string | number; lastActivityAt: Date | string | null }>>(
            `SELECT novel_id AS novelId, MAX(updated_at) AS lastActivityAt
             FROM (
                 SELECT novel_id, updated_at FROM chapters WHERE novel_id IN (${placeholders})
                 UNION ALL
                 SELECT novel_id, updated_at FROM drive_upload_jobs WHERE novel_id IN (${placeholders})
                 UNION ALL
                 SELECT novel_id, updated_at FROM crawl_jobs WHERE novel_id IN (${placeholders})
                 UNION ALL
                 SELECT novel_id, updated_at FROM tts_jobs WHERE novel_id IN (${placeholders})
                 UNION ALL
                 SELECT novel_id, updated_at FROM playback_state WHERE novel_id IN (${placeholders})
             ) AS activity
             GROUP BY novel_id`,
            [...ids, ...ids, ...ids, ...ids, ...ids],
        );

        for (const row of rows) {
            const parsed = row.lastActivityAt ? new Date(row.lastActivityAt) : null;
            if (parsed && !Number.isNaN(parsed.getTime())) {
                lastActivityByNovelId.set(Number(row.novelId), parsed);
            }
        }
        return lastActivityByNovelId;
    }

    async getPlayback(id: number): Promise<PlaybackState | null> {
        await this.findOne(id);
        return this.playbackRepository.findOne({ where: { novelId: id } });
    }

    async upsertPlayback(id: number, request: UpdatePlaybackRequest): Promise<PlaybackState> {
        await this.findOne(id);
        const existing = await this.playbackRepository.findOne({ where: { novelId: id } });
        const model = existing ?? this.playbackRepository.create({ novelId: id });
        model.chapterNumber = request.chapterNumber;
        model.positionSec = request.positionSec;
        return this.playbackRepository.save(model);
    }
}
