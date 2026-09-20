import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { JobStatus } from 'src/common/enums/job-status.enum';

function toOptionalBoolean(value: unknown): boolean | undefined {
    if (value === undefined || value === null || value === '') {
        return undefined;
    }
    if (typeof value === 'boolean') {
        return value;
    }
    return ['true', '1', 'yes'].includes(String(value).toLowerCase());
}

export class ListChaptersQuery {
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
    @Max(200)
    @ApiPropertyOptional({ default: 15, maximum: 200 })
    limit?: number;

    @IsOptional()
    @IsEnum(JobStatus)
    @ApiPropertyOptional({ enum: JobStatus })
    crawlStatus?: JobStatus;

    @IsOptional()
    @IsEnum(JobStatus)
    @ApiPropertyOptional({ enum: JobStatus })
    ttsStatus?: JobStatus;

    @IsOptional()
    @Transform(({ value }) => toOptionalBoolean(value))
    @IsBoolean()
    @ApiPropertyOptional({ description: 'Lọc chương đã có mp3_path' })
    hasMp3?: boolean;
}
