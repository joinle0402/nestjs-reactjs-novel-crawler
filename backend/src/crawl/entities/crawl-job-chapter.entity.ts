import { Chapter } from 'src/chapters/chapters.entity';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { CrawlJob } from './crawl-job.entity';

export const CRAWL_CHAPTER_STATUSES = ['pending', 'running', 'completed', 'failed', 'skipped'] as const;
export type CrawlChapterStatus = (typeof CRAWL_CHAPTER_STATUSES)[number];

@Entity('crawl_job_chapters')
@Unique('uk_crawl_job_chapters_job_number', ['jobId', 'chapterNumber'])
@Index('idx_crawl_job_chapters_status', ['status'])
@Index('idx_crawl_job_chapters_chapter', ['chapterId'])
export class CrawlJobChapter {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => CrawlJob, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'job_id' })
    job!: CrawlJob;

    @Column({ name: 'job_id' })
    jobId!: number;

    @ManyToOne(() => Chapter, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: 'chapter_id' })
    chapter!: Chapter | null;

    @Column({ name: 'chapter_id', type: 'int', nullable: true })
    chapterId!: number | null;

    @Column({ name: 'chapter_number', type: 'int' })
    chapterNumber!: number;

    @Column({ name: 'chapter_site_id', type: 'varchar', length: 191, nullable: true })
    chapterSiteId!: string | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    title!: string | null;

    @Column({ type: 'varchar', length: 20 })
    status!: CrawlChapterStatus;

    @Column({ name: 'attempt_count', type: 'int', default: 0 })
    attemptCount!: number;

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
