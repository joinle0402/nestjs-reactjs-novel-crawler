import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NovelStatsResponse } from './novel-stats.response';

export class NovelStatsCounts {
    @ApiProperty({ description: 'Tổng số chương' })
    total!: number;

    @ApiProperty({ description: 'Số chương crawl_status = completed' })
    crawled!: number;

    @ApiProperty({ description: 'Số chương cuối cùng đã có nội dung (điểm cào dừng)', nullable: true })
    lastCrawled!: number | null;

    @ApiProperty({ description: 'Số chương tts_status = completed' })
    ttsDone!: number;

    @ApiProperty()
    crawlFailed!: number;

    @ApiProperty()
    ttsFailed!: number;
}

export class NovelListItemResponse {
    @ApiProperty()
    id!: number;

    @ApiProperty()
    url!: string;

    @ApiProperty()
    title!: string;

    @ApiPropertyOptional({ nullable: true })
    author!: string | null;

    @ApiPropertyOptional({ nullable: true })
    summary!: string | null;

    @ApiPropertyOptional({ nullable: true, description: 'URL ảnh bìa hoặc tên file ảnh nội bộ' })
    coverImage!: string | null;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty({
        description: 'ISO 8601 — hoạt động gần nhất (chương, job crawl/TTS/Drive hoặc nghe truyện), fallback về createdAt',
    })
    lastActivityAt!: string;

    @ApiProperty({ type: NovelStatsCounts })
    stats!: NovelStatsCounts;
}

export function toStatsCounts(
    raw?: {
        total?: string | number | null;
        crawled?: string | number | null;
        lastCrawled?: string | number | null;
        ttsDone?: string | number | null;
        crawlFailed?: string | number | null;
        ttsFailed?: string | number | null;
    } | null,
): NovelStatsCounts {
    return {
        total: Number(raw?.total ?? 0),
        crawled: Number(raw?.crawled ?? 0),
        lastCrawled: raw?.lastCrawled == null ? null : Number(raw.lastCrawled),
        ttsDone: Number(raw?.ttsDone ?? 0),
        crawlFailed: Number(raw?.crawlFailed ?? 0),
        ttsFailed: Number(raw?.ttsFailed ?? 0),
    };
}

export function toNovelStatsResponse(novelId: number, title: string, counts: NovelStatsCounts): NovelStatsResponse {
    return {
        novelId,
        title,
        ...counts,
    };
}
