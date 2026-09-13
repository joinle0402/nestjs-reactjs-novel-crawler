import { HttpStatus, Injectable } from '@nestjs/common';
import { Chapter } from './chapters.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { NovelsService } from 'src/novels/novels.service';
import { throwUnless } from 'src/common/utils/throw-if';

@Injectable()
export class ChaptersService {
    constructor(
        @InjectRepository(Chapter)
        private readonly chaptersRepository: Repository<Chapter>,
        private readonly novelsService: NovelsService,
    ) { }

    async findByNovel(novelId: number): Promise<Chapter[]> {
        return this.chaptersRepository.find({
            where: { novelId },
            select: {
                id: true,
                novelId: true,
                chapterSiteId: true,
                chapterNumber: true,
                title: true,
                crawlStatus: true,
                ttsStatus: true,
                hasMp3: true,
            },
            order: {
                chapterNumber: 'ASC',
            },
        });
    }

    async findById(id: number): Promise<Chapter> {
        const model = await this.chaptersRepository.findOne({ where: { id } });
        throwUnless(model, `Không tìm thấy chương với id ${id}`, HttpStatus.NOT_FOUND);
        return model;
    }

}
