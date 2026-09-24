import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { CRAWL_CHAPTER_STATUSES, type CrawlChapterStatus } from '../../entities/crawl-job-chapter.entity';
import { CRAWL_JOB_STATUSES, CRAWL_SCOPES, type CrawlJobStatus, type CrawlScope } from '../../entities/crawl-job.entity';

export class CreateCrawlJobRequest {
    @IsOptional()
    @IsString()
    @MaxLength(512)
    @ApiPropertyOptional({ example: 'https://sangtacviet.com/truyen/qidian/1/12345/' })
    url?: string;

    @IsOptional()
    @IsInt()
    @Min(1)
    @ApiPropertyOptional()
    novelId?: number;

    @IsIn(CRAWL_SCOPES)
    @ApiProperty({ enum: CRAWL_SCOPES })
    scope!: CrawlScope;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    @ApiPropertyOptional({ description: 'Bắt buộc khi scope=chapters. 10 | 5-10 | 1,2,5 | all' })
    chapterRange?: string;
}

export class ListCrawlJobsQuery {
    @IsOptional()
    @IsIn(CRAWL_JOB_STATUSES)
    @ApiPropertyOptional({ enum: CRAWL_JOB_STATUSES })
    status?: CrawlJobStatus;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @ApiPropertyOptional()
    novelId?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @ApiPropertyOptional({ default: 1 })
    page?: number;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    @ApiPropertyOptional({ default: 20 })
    limit?: number;
}

export class ListCrawlChaptersQuery {
    @IsOptional()
    @IsIn(CRAWL_CHAPTER_STATUSES)
    @ApiPropertyOptional({ enum: CRAWL_CHAPTER_STATUSES })
    status?: CrawlChapterStatus;
}
