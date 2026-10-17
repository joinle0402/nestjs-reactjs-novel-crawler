import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class UpdateChapterRequest {
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'ID chương trên site nguồn', example: '123456', required: false })
    chapterSiteId?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @ApiProperty({ description: 'Số chương', example: 1, required: false })
    chapterNumber?: number;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Tiêu đề chương', example: 'Chương 1: Khởi đầu', required: false })
    title?: string;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: 'Nội dung chương', required: false })
    content?: string | null;

    @IsOptional()
    @IsBoolean()
    @ApiProperty({ description: 'MP3 đã trộn sẵn nhạc nền', required: false })
    hasBgm?: boolean;
}
