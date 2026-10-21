import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
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
    @Max(10000)
    @ApiPropertyOptional({ default: 15, maximum: 10000 })
    limit?: number;

    @IsOptional()
    @IsString()
    @MaxLength(200)
    @ApiPropertyOptional({ description: 'Lọc theo tên chương' })
    q?: string;

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

    @IsOptional()
    @Transform(({ value }) => toOptionalBoolean(value))
    @IsBoolean()
    @ApiPropertyOptional({ description: 'Lọc chương đã upload lên Drive (true) hoặc chưa (false)' })
    onDrive?: boolean;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @ApiPropertyOptional({ description: 'ID chương cần mở; server tự chọn trang chứa chương này' })
    focusChapterId?: number;
}
