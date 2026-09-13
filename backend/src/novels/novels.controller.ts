import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { NovelsService } from './novels.service';
import { Novel } from './entities/novel.entity';
import { CreateNovelRequest } from './dtos/requests/create-novel.request';
import { UpdateNovelRequest } from './dtos/requests/update-novel.request';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Novels')
@Controller('novels')
export class NovelsController {
    constructor(private readonly novelsService: NovelsService) { }

    @Get()
    @ApiOperation({ summary: 'Lấy danh sách truyện' })
    @ApiResponse({ status: 200, description: 'Lấy danh sách truyện thành công' })
    async findAll(): Promise<Novel[]> {
        return this.novelsService.findAll();
    }

    @Get(':id')
    @ApiOperation({ summary: 'Lấy truyện theo id' })
    @ApiResponse({ status: 200, description: 'Lấy truyện theo id thành công' })
    async findOne(@Param('id') id: number): Promise<Novel> {
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
    async update(@Param('id') id: number, @Body() request: UpdateNovelRequest): Promise<Novel> {
        return this.novelsService.update(id, request);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Xóa truyện' })
    @ApiResponse({ status: 200, description: 'Xóa truyện thành công' })
    async delete(@Param('id') id: number): Promise<void> {
        return this.novelsService.delete(id);
    }
}
