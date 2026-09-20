import { HttpStatus, Injectable } from '@nestjs/common';
import { Chapter } from './chapters.entity';
import { LessThan, MoreThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { NovelsService } from 'src/novels/novels.service';
import { throwUnless } from 'src/common/utils/throw-if';
import { ListChaptersQuery } from './dtos/requests/list-chapters.query';
import { paginated, PaginatedResponse } from 'src/common/dtos/paginated.response';
import { ChapterDetailResponse, ChapterNeighbor } from './dtos/responses/chapter-detail.response';

export type ChapterListItem = {
    id: number;
    novelId: number;
    chapterSiteId: string;
    chapterNumber: number;
    title: string;
    crawlStatus: Chapter['crawlStatus'];
    ttsStatus: Chapter['ttsStatus'];
    mp3Path: string | null;
    hasMp3: boolean;
    ttsCharsTotal: number;
    ttsCharsDone: number;
};

@Injectable()
export class ChaptersService {
    constructor(
        @InjectRepository(Chapter)
        private readonly chaptersRepository: Repository<Chapter>,
        private readonly novelsService: NovelsService,
    ) { }

    async findByNovel(novelId: number, query: ListChaptersQuery): Promise<PaginatedResponse<ChapterListItem>> {
        await this.novelsService.findOne(novelId);

        const page = query.page ?? 1;
        const limit = query.limit ?? 15;

        const qb = this.chaptersRepository
            .createQueryBuilder('chapter')
            .select([
                'chapter.id',
                'chapter.novelId',
                'chapter.chapterSiteId',
                'chapter.chapterNumber',
                'chapter.title',
                'chapter.crawlStatus',
                'chapter.ttsStatus',
                'chapter.mp3Path',
                'chapter.ttsCharsTotal',
                'chapter.ttsCharsDone',
            ])
            .where('chapter.novelId = :novelId', { novelId })
            .orderBy('chapter.chapterNumber', 'ASC');

        if (query.crawlStatus) {
            qb.andWhere('chapter.crawlStatus = :crawlStatus', { crawlStatus: query.crawlStatus });
        }
        if (query.ttsStatus) {
            qb.andWhere('chapter.ttsStatus = :ttsStatus', { ttsStatus: query.ttsStatus });
        }
        if (query.hasMp3 === true) {
            qb.andWhere("chapter.mp3Path IS NOT NULL AND chapter.mp3Path <> ''");
        } else if (query.hasMp3 === false) {
            qb.andWhere("(chapter.mp3Path IS NULL OR chapter.mp3Path = '')");
        }

        const [rows, total] = await qb.skip((page - 1) * limit).take(limit).getManyAndCount();

        return paginated(
            rows.map((chapter) => this.toListItem(chapter)),
            total,
            page,
            limit,
        );
    }

    async findById(id: number): Promise<ChapterDetailResponse> {
        const model = await this.chaptersRepository.findOne({ where: { id } });
        throwUnless(model, `Không tìm thấy chương với id ${id}`, HttpStatus.NOT_FOUND);

        const [prev, next] = await Promise.all([this.findNeighbor(model, 'prev'), this.findNeighbor(model, 'next')]);

        return {
            id: model.id,
            novelId: model.novelId,
            chapterSiteId: model.chapterSiteId,
            chapterNumber: model.chapterNumber,
            title: model.title,
            content: model.content,
            mp3Path: model.mp3Path,
            hasMp3: Boolean(model.mp3Path),
            crawledAt: model.crawledAt,
            crawlStatus: model.crawlStatus,
            ttsStatus: model.ttsStatus,
            ttsCharsTotal: model.ttsCharsTotal,
            ttsCharsDone: model.ttsCharsDone,
            createdAt: model.createdAt,
            updatedAt: model.updatedAt,
            prev,
            next,
        };
    }

    async findByNovelAndNumber(novelId: number, chapterNumber: number): Promise<ChapterDetailResponse> {
        const model = await this.chaptersRepository.findOne({
            where: { novelId, chapterNumber },
        });
        throwUnless(model, `Không tìm thấy chương ${chapterNumber} của truyện ${novelId}`, HttpStatus.NOT_FOUND);
        return this.findById(model.id);
    }

    async getMp3Path(id: number): Promise<{ id: number; mp3Path: string }> {
        const model = await this.chaptersRepository.findOne({
            where: { id },
            select: { id: true, mp3Path: true },
        });
        throwUnless(model, `Không tìm thấy chương với id ${id}`, HttpStatus.NOT_FOUND);
        throwUnless(model.mp3Path, 'Chương chưa có file MP3', HttpStatus.NOT_FOUND);
        return { id: model.id, mp3Path: model.mp3Path };
    }

    private async findNeighbor(chapter: Chapter, direction: 'prev' | 'next'): Promise<ChapterNeighbor | null> {
        const neighbor = await this.chaptersRepository.findOne({
            where: {
                novelId: chapter.novelId,
                chapterNumber: direction === 'prev' ? LessThan(chapter.chapterNumber) : MoreThan(chapter.chapterNumber),
            },
            order: { chapterNumber: direction === 'prev' ? 'DESC' : 'ASC' },
            select: { id: true, chapterNumber: true, title: true, mp3Path: true },
        });
        if (!neighbor) {
            return null;
        }
        return {
            id: neighbor.id,
            chapterNumber: neighbor.chapterNumber,
            title: neighbor.title,
            hasMp3: Boolean(neighbor.mp3Path),
        };
    }

    private toListItem(chapter: Chapter): ChapterListItem {
        return {
            id: chapter.id,
            novelId: chapter.novelId,
            chapterSiteId: chapter.chapterSiteId,
            chapterNumber: chapter.chapterNumber,
            title: chapter.title,
            crawlStatus: chapter.crawlStatus,
            ttsStatus: chapter.ttsStatus,
            mp3Path: chapter.mp3Path,
            hasMp3: Boolean(chapter.mp3Path),
            ttsCharsTotal: chapter.ttsCharsTotal,
            ttsCharsDone: chapter.ttsCharsDone,
        };
    }
}
