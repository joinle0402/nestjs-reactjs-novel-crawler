import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChaptersService, ChapterListItem } from './chapters.service';
import { ListChaptersQuery } from './dtos/requests/list-chapters.query';
import { PaginatedResponse } from 'src/common/dtos/paginated.response';
import { ChapterDetailResponse } from './dtos/responses/chapter-detail.response';

@ApiTags('Chapters')
@Controller('chapters')
export class ChaptersController {
    constructor(private readonly chaptersService: ChaptersService) { }

    @Get('novel/:novelId')
    @ApiOperation({ summary: 'Mục lục chương (không trả content)' })
    async findByNovel(@Param('novelId', ParseIntPipe) novelId: number, @Query() query: ListChaptersQuery): Promise<PaginatedResponse<ChapterListItem>> {
        return this.chaptersService.findByNovel(novelId, query);
    }

    @Get('novel/:novelId/number/:chapterNumber')
    @ApiOperation({ summary: 'Chi tiết chương theo số chương (dùng resume playback)' })
    @ApiResponse({ status: 200, type: ChapterDetailResponse })
    async findByNovelAndNumber(@Param('novelId', ParseIntPipe) novelId: number, @Param('chapterNumber', ParseIntPipe) chapterNumber: number,): Promise<ChapterDetailResponse> {
        return this.chaptersService.findByNovelAndNumber(novelId, chapterNumber);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Chi tiết 1 chương (có content + prev/next)' })
    @ApiResponse({ status: 200, type: ChapterDetailResponse })
    async findById(@Param('id', ParseIntPipe) id: number): Promise<ChapterDetailResponse> {
        return this.chaptersService.findById(id);
    }
}
