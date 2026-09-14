import { ApiProperty } from '@nestjs/swagger';

export class NovelStatsResponse {
    @ApiProperty()
    novelId!: number;

    @ApiProperty()
    title!: string;

    @ApiProperty({ description: 'Tổng số chương' })
    total!: number;

    @ApiProperty({ description: 'Số chương crawl_status = completed' })
    crawled!: number;

    @ApiProperty({ description: 'Số chương tts_status = completed' })
    ttsDone!: number;

    @ApiProperty()
    crawlFailed!: number;

    @ApiProperty()
    ttsFailed!: number;
}
