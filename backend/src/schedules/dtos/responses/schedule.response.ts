import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { ScheduleLastStatus, ScheduleRunStage } from '../../entities/schedule.entity';

export class ScheduleResponse {
    @ApiProperty()
    id!: number;

    @ApiProperty()
    novelId!: number;

    @ApiProperty()
    novelTitle!: string;

    @ApiPropertyOptional({ nullable: true })
    novelCoverImage!: string | null;

    @ApiPropertyOptional({ nullable: true })
    novelUrl!: string | null;

    @ApiProperty({ type: [Number] })
    daysOfWeek!: number[];

    @ApiProperty({ example: '08:00' })
    timeOfDay!: string;

    @ApiProperty()
    autoCrawl!: boolean;

    @ApiProperty()
    autoTts!: boolean;

    @ApiProperty()
    autoDrive!: boolean;

    @ApiProperty()
    active!: boolean;

    @ApiProperty({ enum: ['idle', 'sync', 'crawl', 'tts', 'drive'] })
    runStage!: ScheduleRunStage;

    @ApiPropertyOptional({ nullable: true, enum: ['running', 'completed', 'skipped', 'failed'] })
    lastStatus!: ScheduleLastStatus | null;

    @ApiPropertyOptional({ nullable: true })
    lastMessage!: string | null;

    @ApiPropertyOptional({ nullable: true })
    lastRunAt!: Date | null;

    @ApiPropertyOptional({ nullable: true })
    nextRunAt!: Date | null;

    @ApiPropertyOptional({ nullable: true })
    lastNewChapters!: number | null;

    @ApiPropertyOptional({ nullable: true })
    crawlJobId!: number | null;

    @ApiPropertyOptional({ nullable: true })
    ttsJobId!: number | null;

    @ApiPropertyOptional({ nullable: true })
    driveJobId!: number | null;

    @ApiProperty()
    createdAt!: Date;
}
