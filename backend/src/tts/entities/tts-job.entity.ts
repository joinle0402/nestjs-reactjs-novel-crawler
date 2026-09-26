import { Novel } from 'src/novels/entities/novel.entity';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const TTS_SCOPES = ['missing', 'failed', 'chapters'] as const;
export type TtsScope = (typeof TTS_SCOPES)[number];

export const TTS_JOB_STATUSES = ['pending', 'running', 'stopped', 'completed', 'failed'] as const;
export type TtsJobStatus = (typeof TTS_JOB_STATUSES)[number];

export const TTS_ENGINES = ['edge-tts', 'vieneu'] as const;
export type TtsEngine = (typeof TTS_ENGINES)[number];

export const TTS_ENGINE = 'edge-tts';

export const EDGE_TTS_VOICES: { id: string; label: string }[] = [
    { id: 'vi-VN-HoaiMyNeural', label: 'Hoài My (nữ)' },
    { id: 'vi-VN-NamMinhNeural', label: 'Nam Minh (nam)' },
];

/** Tên truyền vào VieNeu `infer(voice=...)`. Hải Đăng là giọng mặc định của v3 Turbo. */
export const VIENEU_VOICES: { id: string; label: string }[] = [
    { id: 'Adam bựa', label: 'Adam bựa — nam, Bắc, tự nhiên' },
    { id: 'Trúc Ly', label: 'Trúc Ly — nữ, Bắc, tự nhiên' },
    { id: 'Thiện Minh', label: 'Thiện Minh — nam, Bắc, kể chuyện' },
    { id: 'Mai Anh', label: 'Mai Anh — nữ, Bắc, tin tức' },
    { id: 'Hải Đăng', label: 'Hải Đăng — nam, Bắc, tự nhiên' },
    { id: 'Thùy Dung', label: 'Thùy Dung — nữ, miền Nam, tin tức' },
    { id: 'Thiền Tâm Đức', label: 'Thiền Tâm Đức — nam, Bắc, kể chuyện' },
    { id: 'Ngọc Huyền', label: 'Ngọc Huyền — nữ, Bắc, tự nhiên' },
    { id: 'Quang Sơn', label: 'Quang Sơn — nam, Trung, tự nhiên' },
    { id: 'Ngọc Trân', label: 'Ngọc Trân — nữ, Trung, tự nhiên' },
    { id: 'Minh Đức', label: 'Minh Đức — nam, Bắc, tin tức' },
    { id: 'Phạm Tuyên', label: 'Phạm Tuyên — nam, Bắc, tự nhiên' },
    { id: 'Thái Sơn', label: 'Thái Sơn — nam, miền Nam, kể chuyện' },
    { id: 'Xuân Vĩnh', label: 'Xuân Vĩnh — nam, Bắc, tự nhiên' },
    { id: 'Thanh Bình', label: 'Thanh Bình — nam, Bắc, kể chuyện' },
    { id: 'Ngọc Linh', label: 'Ngọc Linh — nữ, Bắc, kể chuyện' },
    { id: 'Đoan Trang', label: 'Đoan Trang — nữ, Bắc, tự nhiên' },
    { id: 'Thục Đoan', label: 'Thục Đoan — nữ, miền Nam, kể chuyện' },
    { id: 'Minh Triết', label: 'Minh Triết — nam, miền Nam, tin tức' },
    { id: 'Mỹ Duyên', label: 'Mỹ Duyên — nữ, miền Nam, đọc truyện' },
    { id: 'Quỳnh Anh', label: 'Quỳnh Anh — nữ, Bắc, đọc truyện' },
    { id: 'Đức Trí', label: 'Đức Trí — nam, miền Nam, đọc truyện' },
    { id: 'Kim Thanh', label: 'Kim Thanh — nữ, miền Nam, đọc truyện' },
    { id: 'Adam', label: 'Adam — nam, miền Nam, tự nhiên' },
    { id: 'Quốc Tuấn', label: 'Quốc Tuấn — nam, Bắc, tự nhiên' },
];

export function voicesForEngine(engine: string): { id: string; label: string }[] {
    return engine === 'vieneu' ? VIENEU_VOICES : EDGE_TTS_VOICES;
}

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
