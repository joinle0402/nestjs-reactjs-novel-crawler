import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JobStatus } from 'src/common/enums/job-status.enum';

export class ChapterNeighbor {
    @ApiProperty()
    id!: number;

    @ApiProperty()
    chapterNumber!: number;

    @ApiProperty()
    title!: string;

    @ApiProperty({ description: 'Chapter kế bên đã có mp3_path' })
    hasMp3!: boolean;
}

export class ChapterDetailResponse {
    @ApiProperty()
    id!: number;

    @ApiProperty()
    novelId!: number;

    @ApiProperty()
    chapterSiteId!: string;

    @ApiProperty()
    chapterNumber!: number;

    @ApiProperty()
    title!: string;

    @ApiPropertyOptional({ nullable: true })
    content!: string | null;

    @ApiPropertyOptional({ nullable: true })
    mp3Path!: string | null;

    @ApiProperty()
    hasMp3!: boolean;

    @ApiProperty()
    crawledAt!: Date;

    @ApiProperty({ enum: JobStatus })
    crawlStatus!: JobStatus;

    @ApiProperty({ enum: JobStatus })
    ttsStatus!: JobStatus;

    @ApiProperty()
    ttsCharsTotal!: number;

    @ApiProperty()
    ttsCharsDone!: number;

    @ApiProperty()
    createdAt!: Date;

    @ApiProperty()
    updatedAt!: Date;

    @ApiPropertyOptional({ type: ChapterNeighbor, nullable: true })
    prev!: ChapterNeighbor | null;

    @ApiPropertyOptional({ type: ChapterNeighbor, nullable: true })
    next!: ChapterNeighbor | null;
}
