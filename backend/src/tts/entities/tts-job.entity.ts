import { Novel } from 'src/novels/entities/novel.entity';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const TTS_SCOPES = ['missing', 'failed', 'chapters'] as const;
export type TtsScope = (typeof TTS_SCOPES)[number];

export const TTS_JOB_STATUSES = ['pending', 'running', 'stopped', 'completed', 'failed'] as const;
export type TtsJobStatus = (typeof TTS_JOB_STATUSES)[number];

export const TTS_ENGINE = 'edge-tts';

export const EDGE_TTS_VOICES: { id: string; label: string }[] = [
    { id: 'vi-VN-HoaiMyNeural', label: 'Hoài My (nữ)' },
    { id: 'vi-VN-NamMinhNeural', label: 'Nam Minh (nam)' },
];

@Entity('tts_jobs')
@Index('idx_tts_jobs_status', ['status'])
export class TtsJob {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => Novel, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'novel_id' })
    novel!: Novel;

    @Column({ name: 'novel_id' })
    novelId!: number;

    @Column({ type: 'varchar', length: 20 })
    scope!: TtsScope;

    @Column({ name: 'chapter_range', type: 'varchar', length: 2000, nullable: true })
    chapterRange!: string | null;

    @Column({ name: 'chapter_numbers', type: 'json', nullable: true })
    chapterNumbers!: number[] | null;

    @Column({ type: 'varchar', length: 32 })
    engine!: string;

    @Column({ type: 'varchar', length: 128 })
    voice!: string;

    @Column({ type: 'varchar', length: 32 })
    rate!: string;

    @Column({ name: 'bgm_enabled', type: 'boolean', default: true })
    bgmEnabled!: boolean;

    @Column({ type: 'varchar', length: 20 })
    status!: TtsJobStatus;

    @Column({ name: 'started_at', type: 'datetime', nullable: true })
    startedAt!: Date | null;

    @Column({ name: 'finished_at', type: 'datetime', nullable: true })
    finishedAt!: Date | null;

    @Column({ name: 'error_message', type: 'text', nullable: true })
    errorMessage!: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
    updatedAt!: Date;
}
