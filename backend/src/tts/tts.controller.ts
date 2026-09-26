import { Body, Controller, Get, HttpCode, NotFoundException, Post, Put, Query, ParseIntPipe, StreamableFile } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { createReadStream } from 'fs';
import { unlink } from 'fs/promises';
import { TtsService } from './tts.service';
import { TtsSettingsService } from './tts-settings.service';
import { TtsSampleService } from './tts-sample.service';
import { StartTtsJobRequest } from './dtos/requests/start-tts-job.request';
import { TtsSampleRequest } from './dtos/requests/tts-sample.request';
import { TtsSavedSampleQuery } from './dtos/requests/tts-saved-sample.query';
import { UpdateTtsSettingsRequest } from './dtos/requests/update-tts-settings.request';
import { TtsJobResponse } from './dtos/responses/tts-job.response';
import { TtsPreviewResponse } from './dtos/responses/tts-preview.response';
import { TtsSettingsResponse } from './dtos/responses/tts-settings.response';

@ApiTags('TTS')
@Controller('tts')
export class TtsController {
    constructor(
        private readonly ttsService: TtsService,
        private readonly settingsService: TtsSettingsService,
        private readonly sampleService: TtsSampleService,
    ) {}

    @Get('settings')
    @ApiOperation({ summary: 'Mặc định TTS (worker/tts_settings.json)' })
    @ApiOkResponse({ type: TtsSettingsResponse })
    getSettings(): Promise<TtsSettingsResponse> {
        return this.settingsService.get();
    }

    @Put('settings')
    @ApiOperation({ summary: 'Lưu mặc định TTS. Không đổi job đang chạy.' })
    @ApiOkResponse({ type: TtsSettingsResponse })
    updateSettings(@Body() request: UpdateTtsSettingsRequest): Promise<TtsSettingsResponse> {
        return this.settingsService.update(request);
    }

    @Get('sample/saved')
    @ApiOperation({ summary: 'MP3 mẫu đã lưu cho câu thử mặc định. 404 nếu chưa có file.' })
    @ApiProduces('audio/mpeg')
    @ApiOkResponse({ description: 'File MP3 đã lưu' })
    savedSample(@Query() query: TtsSavedSampleQuery): StreamableFile {
        const filePath = this.sampleService.savedPath(query);
        if (!filePath) {
            throw new NotFoundException('Chưa có mẫu giọng cho câu này');
        }
        return this.audioFile(filePath, false);
    }

    @Post('sample')
    @HttpCode(200)
    @ApiOperation({ summary: 'MP3 ngắn để nghe thử giọng đang chọn. Câu mẫu mặc định dùng file đã lưu.' })
    @ApiProduces('audio/mpeg')
    @ApiOkResponse({ description: 'File MP3 mẫu' })
    async sample(@Body() request: TtsSampleRequest): Promise<StreamableFile> {
        const created = await this.sampleService.create(request);
        return this.audioFile(created.filePath, created.temporary);
    }

    private audioFile(filePath: string, temporary: boolean): StreamableFile {
        const stream = createReadStream(filePath);
        if (temporary) {
            const cleanup = () => {
                void unlink(filePath).catch(() => undefined);
            };
            stream.on('close', cleanup);
            stream.on('error', cleanup);
        }
        return new StreamableFile(stream, {
            type: 'audio/mpeg',
            disposition: 'inline; filename="tts-sample.mp3"',
        });
    }

    @Get('preview')
    @ApiOperation({ summary: 'Số chương sẽ làm cho missing/failed, và preview phạm vi chapters' })
    @ApiOkResponse({ type: TtsPreviewResponse })
    preview(
        @Query('novelId', ParseIntPipe) novelId: number,
        @Query('chapterRange') chapterRange?: string,
    ): Promise<TtsPreviewResponse> {
        return this.ttsService.preview(novelId, chapterRange);
    }

    @Get('jobs/current')
    @ApiOperation({ summary: 'Job pending/running, hoặc null' })
    @ApiOkResponse({ type: TtsJobResponse })
    current(): Promise<TtsJobResponse | null> {
        return this.ttsService.getCurrent();
    }

    @Get('jobs/logs')
    @ApiOperation({ summary: 'Log gần nhất của worker TTS' })
    logs(@Query('lines') lines?: number): Promise<{ lines: string[] }> {
        return this.ttsService.getLogs(lines ? Number(lines) : 150);
    }

    @Post('jobs')
    @ApiOperation({ summary: 'Bắt đầu job TTS. Trả ngay, không chờ MP3 xong.' })
    @ApiOkResponse({ type: TtsJobResponse })
    start(@Body() request: StartTtsJobRequest): Promise<TtsJobResponse> {
        return this.ttsService.start(request);
    }

    @Post('jobs/stop')
    @HttpCode(200)
    @ApiOperation({ summary: 'Dừng job đang chạy và reset chương processing' })
    @ApiOkResponse({ type: TtsJobResponse })
    stop(): Promise<TtsJobResponse> {
        return this.ttsService.stop();
    }
}
