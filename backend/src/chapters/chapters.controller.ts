import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChaptersService, ChapterListItem } from './chapters.service';
import { Chapter } from './chapters.entity';
import { ListChaptersQuery } from './dtos/requests/list-chapters.query';
import { PaginatedResponse } from 'src/common/dtos/paginated.response';

@ApiTags('Chapters')
@Controller('chapters')
export class ChaptersController {
    constructor(private readonly chaptersService: ChaptersService) {}

    @Get('novel/:novelId')
    @ApiOperation({ summary: 'Mục lục chương (không trả content)' })
    async findByNovel(@Param('novelId', ParseIntPipe) novelId: number, @Query() query: ListChaptersQuery): Promise<PaginatedResponse<ChapterListItem>> {
        return this.chaptersService.findByNovel(novelId, query);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Chi tiết 1 chương (có content)' })
    async findById(@Param('id', ParseIntPipe) id: number): Promise<Chapter> {
        return this.chaptersService.findById(id);
    }
}
