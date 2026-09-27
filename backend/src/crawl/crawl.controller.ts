import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CrawlService } from './crawl.service';
import { CreateCrawlJobRequest, ListCrawlChaptersQuery, ListCrawlJobsQuery } from './dtos/requests/crawl.request';
import { CrawlJobChapterResponse, CrawlJobListResponse, CrawlJobResponse, CrawlLookupResponse } from './dtos/responses/crawl.response';

@ApiTags('Crawl')
@Controller('crawl')
export class CrawlController {
    constructor(private readonly crawlService: CrawlService) {}

    @Get('lookup')
    @ApiOperation({ summary: 'Kiểm tra URL và nhận diện truyện đã có' })
    @ApiOkResponse({ type: CrawlLookupResponse })
    lookup(@Query('url') url = ''): Promise<CrawlLookupResponse> {
        return this.crawlService.lookup(url);
    }

    @Get('logs')
    @ApiOperation({ summary: 'Đuôi log crawler của phiên job mới nhất, hoặc đúng jobId' })
    logs(@Query('lines') lines?: string, @Query('jobId') jobId?: string): Promise<{ lines: string[] }> {
        const maxLines = Number(lines);
        const parsedJobId = Number(jobId);
        return this.crawlService.getLogs(Number.isFinite(maxLines) && maxLines > 0 ? maxLines : 400, Number.isFinite(parsedJobId) && parsedJobId > 0 ? parsedJobId : undefined);
    }

    @Get('jobs/current')
    @ApiOperation({ summary: 'Job đang chạy, hoặc job vừa kết thúc' })
    @ApiOkResponse({ type: CrawlJobResponse })
    current(): Promise<CrawlJobResponse | null> {
        return this.crawlService.getCurrent();
    }

    @Get('jobs')
    @ApiOperation({ summary: 'Danh sách job cào' })
    @ApiOkResponse({ type: CrawlJobListResponse })
    list(@Query() query: ListCrawlJobsQuery): Promise<CrawlJobListResponse> {
        return this.crawlService.list(query);
    }

    @Post('jobs')
    @ApiOperation({ summary: 'Tạo job cào. Trả ngay, worker Python nhận sau.' })
    @ApiOkResponse({ type: CrawlJobResponse })
    create(@Body() request: CreateCrawlJobRequest): Promise<CrawlJobResponse> {
        return this.crawlService.create(request);
    }

    @Get('jobs/:id')
    @ApiOperation({ summary: 'Chi tiết job và tiến độ' })
    @ApiOkResponse({ type: CrawlJobResponse })
    getOne(@Param('id', ParseIntPipe) id: number): Promise<CrawlJobResponse> {
        return this.crawlService.getOne(id);
    }

    @Get('jobs/:id/chapters')
    @ApiOperation({ summary: 'Kết quả từng chương của job' })
    @ApiOkResponse({ type: [CrawlJobChapterResponse] })
    chapters(@Param('id', ParseIntPipe) id: number, @Query() query: ListCrawlChaptersQuery): Promise<CrawlJobChapterResponse[]> {
        return this.crawlService.chapters(id, query);
    }

    @Post('jobs/:id/pause')
    @HttpCode(200)
    @ApiOperation({ summary: 'Tạm dừng giữa hai chương' })
    pause(@Param('id', ParseIntPipe) id: number): Promise<CrawlJobResponse> {
        return this.crawlService.pause(id);
    }

    @Patch('jobs/:id')
    @ApiOperation({ summary: 'Sửa URL, phạm vi của task đã dừng. Không tạo task mới.' })
    update(@Param('id', ParseIntPipe) id: number, @Body() request: CreateCrawlJobRequest): Promise<CrawlJobResponse> {
        return this.crawlService.update(id, request);
    }

    @Delete('jobs/:id')
    @HttpCode(200)
    @ApiOperation({ summary: 'Xóa lịch sử task đã dừng. Không xóa nội dung chương.' })
    remove(@Param('id', ParseIntPipe) id: number): Promise<{ ok: true }> {
        return this.crawlService.remove(id);
    }

    @Post('jobs/:id/resume')
    @HttpCode(200)
    @ApiOperation({ summary: 'Tiếp tục đúng task này. Chương đã có nội dung được worker bỏ qua.' })
    resume(@Param('id', ParseIntPipe) id: number): Promise<CrawlJobResponse> {
        return this.crawlService.resume(id);
    }

    @Post('jobs/:id/continue')
    @HttpCode(200)
    @ApiOperation({ summary: 'Đã xử lý captcha, cho worker chạy tiếp' })
    continueManual(@Param('id', ParseIntPipe) id: number): Promise<CrawlJobResponse> {
        return this.crawlService.continueManual(id);
    }

    @Post('jobs/:id/cancel')
    @HttpCode(200)
    @ApiOperation({ summary: 'Hủy job' })
    cancel(@Param('id', ParseIntPipe) id: number): Promise<CrawlJobResponse> {
        return this.crawlService.cancel(id);
    }

    @Post('jobs/:id/retry')
    @ApiOperation({ summary: 'Tạo job mới từ các chương lỗi của job này' })
    retry(@Param('id', ParseIntPipe) id: number): Promise<CrawlJobResponse> {
        return this.crawlService.retry(id);
    }
}
