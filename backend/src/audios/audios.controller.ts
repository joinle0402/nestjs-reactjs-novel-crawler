import { Controller, Get, Param, ParseIntPipe, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AudiosService } from './audios.service';
import { ChaptersService } from 'src/chapters/chapters.service';

@ApiTags('Audios')
@Controller('audios')
export class AudiosController {
    constructor(
        private readonly audioService: AudiosService,
        private readonly chaptersService: ChaptersService,
    ) { }

    @Get('chapters/:chapterId')
    @ApiOperation({ summary: 'Stream MP3 chương (hỗ trợ HTTP Range / 206)' })
    @ApiProduces('audio/mpeg')
    @ApiResponse({ status: 200, description: 'Toàn bộ file' })
    @ApiResponse({ status: 206, description: 'Partial Content' })
    async streamChapterAudio(@Param('chapterId', ParseIntPipe) chapterId: number, @Req() request: Request, @Res() response: Response): Promise<void> {
        const chapter = await this.chaptersService.getMp3Path(chapterId);
        const absolutePath = this.audioService.resolveSafePath(chapter.mp3Path);
        await this.audioService.streamFile(absolutePath, request, response);
    }
}
