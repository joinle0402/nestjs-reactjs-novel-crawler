import { Body, Controller, Get, HttpCode, Post, Put, Query, ParseIntPipe } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TtsService } from './tts.service';
import { TtsSettingsService } from './tts-settings.service';
import { StartTtsJobRequest } from './dtos/requests/start-tts-job.request';
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
