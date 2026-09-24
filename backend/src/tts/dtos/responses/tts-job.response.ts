import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TTS_JOB_STATUSES, TTS_SCOPES, type TtsJobStatus, type TtsScope } from '../../entities/tts-job.entity';

export class TtsJobProgress {
    @ApiProperty()
    done!: number;

    @ApiProperty()
    total!: number;

    @ApiPropertyOptional({ nullable: true })
    currentChapterNumber!: number | null;

    @ApiPropertyOptional({ nullable: true })
    currentPercent!: number | null;

    @ApiProperty({ example: 'Ch.12 — 40%, xong 8/42' })
    detail!: string;
}

export class TtsJobResponse {
    @ApiProperty()
    id!: number;

    @ApiProperty()
    novelId!: number;

    @ApiProperty()
    novelTitle!: string;

    @ApiProperty({ enum: TTS_SCOPES })
    scope!: TtsScope;

    @ApiPropertyOptional({ nullable: true })
    chapterRange!: string | null;

    @ApiPropertyOptional({ type: [Number], nullable: true })
    chapterNumbers!: number[] | null;

    @ApiProperty()
    engine!: string;

    @ApiProperty()
    voice!: string;

    @ApiProperty()
    rate!: string;

    @ApiProperty()
    bgmEnabled!: boolean;

    @ApiProperty({ enum: TTS_JOB_STATUSES })
    status!: TtsJobStatus;

    @ApiPropertyOptional({ nullable: true })
    startedAt!: Date | null;

    @ApiPropertyOptional({ nullable: true })
    finishedAt!: Date | null;

    @ApiPropertyOptional({ nullable: true })
    errorMessage!: string | null;

    @ApiProperty({ type: TtsJobProgress })
    progress!: TtsJobProgress;
}
