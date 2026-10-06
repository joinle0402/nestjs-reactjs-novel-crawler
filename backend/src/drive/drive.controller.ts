import { Body, Controller, Get, HttpCode, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DriveService } from './drive.service';
import { StartDriveJobRequest } from './dtos/requests/start-drive-job.request';
import { DriveJobResponse } from './dtos/responses/drive-job.response';
import { DrivePreviewResponse } from './dtos/responses/drive-preview.response';
import { DriveStatusResponse } from './dtos/responses/drive-status.response';

@ApiTags('Drive')
@Controller('drive')
export class DriveController {
    constructor(private readonly driveService: DriveService) {}

    @Get('status')
    @ApiOperation({ summary: 'Trạng thái kết nối Drive (file credentials/token trong worker/)' })
    @ApiOkResponse({ type: DriveStatusResponse })
    status(): Promise<DriveStatusResponse> {
        return this.driveService.status();
    }

    @Get('preview')
    @ApiOperation({ summary: 'Số file MP3, dung lượng, số file thiếu trên Drive, preview phạm vi' })
    @ApiOkResponse({ type: DrivePreviewResponse })
    preview(
        @Query('novelId', ParseIntPipe) novelId: number,
        @Query('chapterRange') chapterRange?: string,
        @Query('refresh') refresh?: string,
    ): Promise<DrivePreviewResponse> {
        const forceRefresh = refresh === '1' || refresh === 'true';
        return this.driveService.preview(novelId, chapterRange, forceRefresh);
    }

    @Get('jobs/current')
    @ApiOperation({ summary: 'Job pending/running, hoặc job vừa xong trong 20s' })
    @ApiOkResponse({ type: DriveJobResponse })
    current(): Promise<DriveJobResponse | null> {
        return this.driveService.getCurrent();
    }

    @Get('jobs/last')
    @ApiOperation({ summary: 'Job upload gần nhất của một truyện (bất kể thời điểm)' })
    @ApiOkResponse({ type: DriveJobResponse })
    last(@Query('novelId', ParseIntPipe) novelId: number): Promise<DriveJobResponse | null> {
        return this.driveService.getLast(novelId);
    }

    @Get('jobs/logs')
    @ApiOperation({ summary: 'Log gần nhất của worker Drive' })
    logs(@Query('lines') lines?: number): Promise<{ lines: string[] }> {
        return this.driveService.getLogs(lines ? Number(lines) : 150);
    }

    @Post('jobs')
    @ApiOperation({ summary: 'Bắt đầu job upload Drive. Trả ngay, upload chạy nền.' })
    @ApiOkResponse({ type: DriveJobResponse })
    start(@Body() request: StartDriveJobRequest): Promise<DriveJobResponse> {
        return this.driveService.start(request);
    }

    @Post('jobs/stop')
    @HttpCode(200)
    @ApiOperation({ summary: 'Dừng job upload đang chạy (giữa 2 file)' })
    @ApiOkResponse({ type: DriveJobResponse })
    stop(): Promise<DriveJobResponse> {
        return this.driveService.stop();
    }
}