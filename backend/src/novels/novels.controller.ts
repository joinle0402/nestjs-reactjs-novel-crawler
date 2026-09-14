import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { NovelsService } from './novels.service';
import { Novel } from './entities/novel.entity';
import { CreateNovelRequest } from './dtos/requests/create-novel.request';
import { UpdateNovelRequest } from './dtos/requests/update-novel.request';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { NovelStatsResponse } from './dtos/responses/novel-stats.response';
import { NovelListItemResponse } from './dtos/responses/novel-list-item.response';
import { UpdatePlaybackRequest } from './dtos/requests/update-playback.request';
import { PlaybackState } from './entities/playback-state.entity';

@ApiTags('Novels')
@Controller('novels')
export class NovelsController {
    constructor(private readonly novelsService: NovelsService) {}

    @Get()
    @ApiOperation({ summary: 'Lấy danh sách truyện kèm thống kê crawl/TTS' })
    @ApiResponse({ status: 200, type: [NovelListItemResponse] })
    async findAll(): Promise<NovelListItemResponse[]> {
        return this.novelsService.findAll();
    }

    @Get(':id/stats')
    @ApiOperation({ summary: 'Thống kê tiến độ crawl/TTS của truyện' })
    @ApiResponse({ status: 200, type: NovelStatsResponse })
    async getStats(@Param('id', ParseIntPipe) id: number): Promise<NovelStatsResponse> {
        return this.novelsService.getStats(id);
    }

    @Get(':id/playback')
    @ApiOperation({ summary: 'Lấy vị trí nghe gần nhất' })
    async getPlayback(@Param('id', ParseIntPipe) id: number): Promise<PlaybackState | null> {
        return this.novelsService.getPlayback(id);
    }

    @Put(':id/playback')
    @ApiOperation({ summary: 'Cập nhật vị trí nghe' })
    async upsertPlayback(
        @Param('id', ParseIntPipe) id: number,
        @Body() request: UpdatePlaybackRequest,
    ): Promise<PlaybackState> {
        return this.novelsService.upsertPlayback(id, request);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Lấy truyện theo id' })
    @ApiResponse({ status: 200, description: 'Lấy truyện theo id thành công' })
    async findOne(@Param('id', ParseIntPipe) id: number): Promise<Novel> {
        return this.novelsService.findOne(id);
    }

    @Post()
    @ApiOperation({ summary: 'Tạo truyện mới' })
    @ApiResponse({ status: 201, description: 'Tạo truyện mới thành công' })
    async create(@Body() request: CreateNovelRequest): Promise<Novel> {
        return this.novelsService.create(request);
    }

    @Put(':id')
    @ApiOperation({ summary: 'Cập nhật truyện' })
    @ApiResponse({ status: 200, description: 'Cập nhật truyện thành công' })
    async update(@Param('id', ParseIntPipe) id: number, @Body() request: UpdateNovelRequest): Promise<Novel> {
        return this.novelsService.update(id, request);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Xóa truyện' })
    @ApiResponse({ status: 200, description: 'Xóa truyện thành công' })
    async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
        return this.novelsService.delete(id);
    }
}
