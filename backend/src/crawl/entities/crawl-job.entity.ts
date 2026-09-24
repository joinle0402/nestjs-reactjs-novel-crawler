import { Novel } from 'src/novels/entities/novel.entity';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const CRAWL_SCOPES = ['missing', 'failed', 'chapters'] as const;
export type CrawlScope = (typeof CRAWL_SCOPES)[number];

export const CRAWL_JOB_STATUSES = [
    'pending',
    'running',
    'paused',
    'waiting_for_manual_action',
    'completed',
    'completed_with_errors',
    'failed',
    'cancelled',
] as const;
export type CrawlJobStatus = (typeof CRAWL_JOB_STATUSES)[number];

export const CRAWL_ACTIVE_STATUSES: CrawlJobStatus[] = ['pending', 'running', 'paused', 'waiting_for_manual_action'];

@Entity('crawl_jobs')
@Index('idx_crawl_jobs_status', ['status'])
export class CrawlJob {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => Novel, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'novel_id' })
    novel!: Novel | null;

    @Column({ name: 'novel_id', type: 'int', nullable: true })
    novelId!: number | null;

    @Column({ type: 'varchar', length: 512 })
    url!: string;

    @Column({ type: 'varchar', length: 20 })
    scope!: CrawlScope;

    @Column({ name: 'chapter_range', type: 'varchar', length: 2000, nullable: true })
    chapterRange!: string | null;

    @Column({ name: 'chapter_numbers', type: 'json', nullable: true })
    chapterNumbers!: number[] | null;

    @Column({ type: 'varchar', length: 30 })
    status!: CrawlJobStatus;

    @Column({ name: 'total_chapters', type: 'int', nullable: true })
    totalChapters!: number | null;

    @Column({ name: 'current_chapter', type: 'int', nullable: true })
    currentChapter!: number | null;

    @Column({ name: 'error_message', type: 'text', nullable: true })
    errorMessage!: string | null;

    @Column({ name: 'started_at', type: 'datetime', nullable: true })
    startedAt!: Date | null;

    @Column({ name: 'finished_at', type: 'datetime', nullable: true })
    finishedAt!: Date | null;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
    updatedAt!: Date;
}
