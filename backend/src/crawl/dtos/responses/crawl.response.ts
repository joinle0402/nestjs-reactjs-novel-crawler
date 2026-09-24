import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CRAWL_CHAPTER_STATUSES, type CrawlChapterStatus } from '../../entities/crawl-job-chapter.entity';
import { CRAWL_JOB_STATUSES, CRAWL_SCOPES, type CrawlJobStatus, type CrawlScope } from '../../entities/crawl-job.entity';

export class CrawlJobProgress {
    @ApiProperty()
    total!: number;

    @ApiProperty()
    completed!: number;

    @ApiProperty()
    failed!: number;

    @ApiProperty()
    skipped!: number;

    @ApiProperty()
    pending!: number;

    @ApiPropertyOptional({ nullable: true })
    currentChapterNumber!: number | null;

    @ApiPropertyOptional({ nullable: true, description: 'null khi chưa biết tổng chương' })
    percent!: number | null;

    @ApiProperty()
    detail!: string;
}

export class CrawlJobResponse {
    @ApiProperty()
    id!: number;

    @ApiPropertyOptional({ nullable: true })
    novelId!: number | null;

    @ApiPropertyOptional({ nullable: true })
    novelTitle!: string | null;

    @ApiProperty()
    url!: string;

    @ApiProperty({ enum: CRAWL_SCOPES })
    scope!: CrawlScope;

    @ApiPropertyOptional({ nullable: true })
    chapterRange!: string | null;

    @ApiPropertyOptional({ type: [Number], nullable: true })
    chapterNumbers!: number[] | null;

    @ApiProperty({ enum: CRAWL_JOB_STATUSES })
    status!: CrawlJobStatus;

    @ApiPropertyOptional({ nullable: true })
    errorMessage!: string | null;

    @ApiPropertyOptional({ nullable: true })
    startedAt!: Date | null;

    @ApiPropertyOptional({ nullable: true })
    finishedAt!: Date | null;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty({ type: CrawlJobProgress })
    progress!: CrawlJobProgress;
}

export class CrawlJobListResponse {
    @ApiProperty({ type: [CrawlJobResponse] })
    items!: CrawlJobResponse[];

    @ApiProperty()
    total!: number;
}

export class CrawlJobChapterResponse {
    @ApiProperty()
    id!: number;

    @ApiProperty()
    chapterNumber!: number;

    @ApiPropertyOptional({ nullable: true })
    chapterId!: number | null;

    @ApiPropertyOptional({ nullable: true })
    title!: string | null;

    @ApiProperty({ enum: CRAWL_CHAPTER_STATUSES })
    status!: CrawlChapterStatus;

    @ApiProperty()
    attemptCount!: number;

    @ApiPropertyOptional({ nullable: true })
    errorMessage!: string | null;

    @ApiPropertyOptional({ nullable: true })
    startedAt!: Date | null;

    @ApiPropertyOptional({ nullable: true })
    finishedAt!: Date | null;
}

export class CrawlLookupResponse {
    @ApiProperty()
    url!: string;

    @ApiPropertyOptional({ nullable: true })
    novelId!: number | null;

    @ApiPropertyOptional({ nullable: true })
    title!: string | null;

    @ApiProperty()
    total!: number;

    @ApiProperty()
    missing!: number;

    @ApiProperty()
    failed!: number;
}
