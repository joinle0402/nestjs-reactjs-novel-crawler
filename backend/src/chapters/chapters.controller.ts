import { Controller, Get, Param } from '@nestjs/common';
import { ChaptersService } from './chapters.service';
import { Chapter } from './chapters.entity';

@Controller('chapters')
export class ChaptersController {
    constructor(private readonly chaptersService: ChaptersService) { }

    @Get('novel/:novelId')
    async findByNovel(@Param('novelId') novelId: number): Promise<Chapter[]> {
        return this.chaptersService.findByNovel(novelId);
    }

    @Get(':id')
    async findById(@Param('id') id: number): Promise<Chapter> {
        return this.chaptersService.findById(id);
    }
}
