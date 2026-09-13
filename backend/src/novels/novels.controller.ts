import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { NovelsService } from './novels.service';
import { Novel } from './entities/novel.entity';
import { CreateNovelRequest } from './dtos/requests/create-novel.request';
import { UpdateNovelRequest } from './dtos/requests/update-novel.request';

@Controller('novels')
export class NovelsController {
    constructor(private readonly novelsService: NovelsService) { }

    @Get()
    async findAll(): Promise<Novel[]> {
        return this.novelsService.findAll();
    }

    @Get(':id')
    async findOne(@Param('id') id: number): Promise<Novel> {
        return this.novelsService.findOne(id);
    }

    @Post()
    async create(@Body() request: CreateNovelRequest): Promise<Novel> {
        return this.novelsService.create(request);
    }

    @Put(':id')
    async update(@Param('id') id: number, @Body() request: UpdateNovelRequest): Promise<Novel> {
        return this.novelsService.update(id, request);
    }

    @Delete(':id')
    async delete(@Param('id') id: number): Promise<void> {
        return this.novelsService.delete(id);
    }
}
