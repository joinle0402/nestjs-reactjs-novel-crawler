import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { throwUnless } from '../common/utils/throw-if';
import { Novel } from './entities/novel.entity';
import { CreateNovelRequest } from './dtos/requests/create-novel.request';
import { UpdateNovelRequest } from './dtos/requests/update-novel.request';
import { Chapter } from '../chapters/chapters.entity';
import { PlaybackState } from './entities/playback-state.entity';
import { NovelStatsResponse } from './dtos/responses/novel-stats.response';
import { UpdatePlaybackRequest } from './dtos/requests/update-playback.request';
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

    async findAll(): Promise<Novel[]> {
        return this.novelsRepository.find({
            order: { id: 'DESC' },
        });
    }

    async findOne(id: number): Promise<Novel> {
        const model = await this.novelsRepository.findOne({ where: { id } });
        throwUnless(model, 'Novel not found', HttpStatus.NOT_FOUND);
        return model;
    }

    async create(request: CreateNovelRequest): Promise<Novel> {
        const model = this.novelsRepository.create(request);
        return this.novelsRepository.save(model);
    }

    async update(id: number, request: UpdateNovelRequest): Promise<Novel> {
        const model = await this.findOne(id);
        Object.assign(model, request);
        return this.novelsRepository.save(model);
    }

    async delete(id: number): Promise<void> {
        const model = await this.findOne(id);
        await this.novelsRepository.remove(model);
    }

    async getStats(id: number): Promise<NovelStatsResponse> {
        const novel = await this.findOne(id);
        const raw = await this.chaptersRepository
            .createQueryBuilder('chapter')
            .select('COUNT(*)', 'total')
            .addSelect('SUM(CASE WHEN chapter.crawl_status = :completed THEN 1 ELSE 0 END)', 'crawled')
            .addSelect('SUM(CASE WHEN chapter.tts_status = :completed THEN 1 ELSE 0 END)', 'ttsDone')
            .addSelect('SUM(CASE WHEN chapter.crawl_status = :failed THEN 1 ELSE 0 END)', 'crawlFailed')
            .addSelect('SUM(CASE WHEN chapter.tts_status = :failed THEN 1 ELSE 0 END)', 'ttsFailed')
            .where('chapter.novel_id = :novelId', {
                novelId: id,
                completed: JobStatus.COMPLETED,
                failed: JobStatus.FAILED,
            })
            .getRawOne<{
                total: string;
                crawled: string | null;
                ttsDone: string | null;
                crawlFailed: string | null;
                ttsFailed: string | null;
            }>();

        return {
            novelId: novel.id,
            title: novel.title,
            total: Number(raw?.total ?? 0),
            crawled: Number(raw?.crawled ?? 0),
            ttsDone: Number(raw?.ttsDone ?? 0),
            crawlFailed: Number(raw?.crawlFailed ?? 0),
            ttsFailed: Number(raw?.ttsFailed ?? 0),
        };
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
