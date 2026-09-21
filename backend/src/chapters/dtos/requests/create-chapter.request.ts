import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateChapterRequest {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @ApiProperty({ description: 'ID truyện', example: 1 })
    novelId!: number;

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        description: 'ID chương trên site nguồn (unique theo truyện). Nếu bỏ trống sẽ dùng số chương.',
        example: '123456',
        required: false,
    })
    chapterSiteId?: string;

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @ApiProperty({ description: 'Số chương', example: 1 })
    chapterNumber!: number;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Tiêu đề chương', example: 'Chương 1: Khởi đầu' })
    title!: string;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: 'Nội dung chương', required: false })
    content?: string;
}
