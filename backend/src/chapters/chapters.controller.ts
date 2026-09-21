import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChaptersService, ChapterListItem } from './chapters.service';
import { ListChaptersQuery } from './dtos/requests/list-chapters.query';
import { CreateChapterRequest } from './dtos/requests/create-chapter.request';
import { UpdateChapterRequest } from './dtos/requests/update-chapter.request';
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

    @Post()
    @ApiOperation({ summary: 'Tạo chương mới' })
    @ApiResponse({ status: 201, type: ChapterDetailResponse })
    async create(@Body() request: CreateChapterRequest): Promise<ChapterDetailResponse> {
        return this.chaptersService.create(request);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Cập nhật chương' })
    @ApiResponse({ status: 200, type: ChapterDetailResponse })
    async update(@Param('id', ParseIntPipe) id: number, @Body() request: UpdateChapterRequest): Promise<ChapterDetailResponse> {
        return this.chaptersService.update(id, request);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Xóa chương' })
    @ApiResponse({ status: 200, description: 'Xóa chương thành công' })
    async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.chaptersService.delete(id);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Chi tiết 1 chương (có content + prev/next)' })
    @ApiResponse({ status: 200, type: ChapterDetailResponse })
    async findById(@Param('id', ParseIntPipe) id: number): Promise<ChapterDetailResponse> {
        return this.chaptersService.findById(id);
    }
}
