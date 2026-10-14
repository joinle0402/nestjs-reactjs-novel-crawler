import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { streamAudioFile } from 'src/audios/stream-audio-file';
import { BgmService, type UploadedAudio } from './bgm.service';
import { BgmTrackResponse } from './dtos/bgm-track.response';

@ApiTags('BGM')
@Controller('bgm')
export class BgmController {
    constructor(private readonly bgmService: BgmService) {}

    @Get()
    @ApiOperation({ summary: 'Danh sách nhạc nền' })
    @ApiOkResponse({ type: BgmTrackResponse, isArray: true })
    list(): Promise<BgmTrackResponse[]> {
        return this.bgmService.list();
    }

    @Post()
    @ApiConsumes('multipart/form-data')
    @ApiOperation({ summary: 'Thêm nhạc nền (tên + file audio)' })
    @ApiOkResponse({ type: BgmTrackResponse })
    @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 40 * 1024 * 1024 } }))
    create(@Body('name') name: string, @UploadedFile() file: UploadedAudio): Promise<BgmTrackResponse> {
        return this.bgmService.create(typeof name === 'string' ? name : '', file);
    }

    @Delete(':id')
    @HttpCode(204)
    @ApiOperation({ summary: 'Xóa nhạc nền' })
    async remove(@Param('id') id: string): Promise<void> {
        await this.bgmService.remove(id);
    }

    @Get(':id/audio')
    @ApiOperation({ summary: 'Stream file nhạc nền' })
    async stream(@Param('id') id: string, @Req() request: Request, @Res() response: Response): Promise<void> {
        const resolved = this.bgmService.resolve(id);
        await streamAudioFile(resolved.filePath, request, response, resolved.contentType);
    }
}
