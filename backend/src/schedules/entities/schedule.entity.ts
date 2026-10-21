import { Novel } from 'src/novels/entities/novel.entity';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const SCHEDULE_RUN_STAGES = ['idle', 'sync', 'crawl', 'tts', 'drive'] as const;
export type ScheduleRunStage = (typeof SCHEDULE_RUN_STAGES)[number];

export const SCHEDULE_LAST_STATUSES = ['running', 'completed', 'skipped', 'failed'] as const;
export type ScheduleLastStatus = (typeof SCHEDULE_LAST_STATUSES)[number];

/** Lịch định kỳ: đồng bộ chương mới, cào, TTS, rồi đẩy Drive. */
@Entity('crawl_schedules')
@Index('idx_crawl_schedules_active', ['active'])
@Index('idx_crawl_schedules_stage', ['runStage'])
export class CrawlSchedule {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => Novel, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'novel_id' })
    novel!: Novel;

    @Column({ name: 'novel_id' })
    novelId!: number;

    /** 0 = Chủ nhật, 1 = Thứ 2 … 6 = Thứ 7 (giống Date.getDay()). */
    @Column({ name: 'days_of_week', type: 'json' })
    daysOfWeek!: number[];

    @Column({ name: 'time_of_day', type: 'varchar', length: 5 })
    timeOfDay!: string;

    @Column({ name: 'auto_crawl', type: 'boolean', default: true })
    autoCrawl!: boolean;

    @Column({ name: 'auto_tts', type: 'boolean', default: true })
    autoTts!: boolean;

    @Column({ name: 'auto_drive', type: 'boolean', default: true })
    autoDrive!: boolean;

    @Column({ type: 'boolean', default: true })
    active!: boolean;

    /** Bước hiện tại của chuỗi cào → TTS → Drive. `idle` là không chạy. */
    @Column({ name: 'run_stage', type: 'varchar', length: 20, default: 'idle' })
    runStage!: ScheduleRunStage;

    @Column({ name: 'last_status', type: 'varchar', length: 20, nullable: true })
    lastStatus!: ScheduleLastStatus | null;

    @Column({ name: 'last_message', type: 'text', nullable: true })
    lastMessage!: string | null;

    @Column({ name: 'last_run_at', type: 'datetime', nullable: true })
    lastRunAt!: Date | null;

    @Column({ name: 'next_run_at', type: 'datetime', nullable: true })
    nextRunAt!: Date | null;

    @Column({ name: 'last_new_chapters', type: 'int', nullable: true })
    lastNewChapters!: number | null;

    /** Số lần đã tự chạy lại sau lỗi đồng bộ chương; reset về 0 khi đồng bộ thành công. */
    @Column({ name: 'retry_count', type: 'int', default: 0 })
    retryCount!: number;

    @Column({ name: 'crawl_job_id', type: 'int', nullable: true })
    crawlJobId!: number | null;

    @Column({ name: 'tts_job_id', type: 'int', nullable: true })
    ttsJobId!: number | null;

    @Column({ name: 'drive_job_id', type: 'int', nullable: true })
    driveJobId!: number | null;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
    updatedAt!: Date;
}
