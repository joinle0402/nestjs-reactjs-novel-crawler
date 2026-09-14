import { JobStatus } from 'src/common/enums/job-status.enum';
import { Novel } from 'src/novels/entities/novel.entity';
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';

@Entity('chapters')
@Unique('uk_chapters_novel_site', ['novelId', 'chapterSiteId'])
export class Chapter {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => Novel, (novel) => novel.chapters, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'novel_id' })
    novel!: Novel;

    @Column({ name: 'novel_id' })
    novelId!: number;

    @Column({ name: 'chapter_site_id', type: 'varchar', length: 191 })
    chapterSiteId!: string;

    @Column({ name: 'chapter_number', type: 'int' })
    chapterNumber!: number;

    @Column({ type: 'varchar', length: 500 })
    title!: string;

    @Column({ type: 'longtext', nullable: true })
    content!: string | null;

    @Column({ name: 'mp3_path', type: 'varchar', length: 2048, nullable: true })
    mp3Path!: string | null;

    @Column({ name: 'crawled_at', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
    crawledAt!: Date;

    @Column({ name: 'crawl_status', type: 'varchar', length: 20, default: JobStatus.PENDING })
    crawlStatus!: JobStatus;

    @Column({ name: 'tts_status', type: 'varchar', length: 20, default: JobStatus.PENDING })
    ttsStatus!: JobStatus;

    @Column({ name: 'tts_chars_total', type: 'int', default: 0 })
    ttsCharsTotal!: number;

    @Column({ name: 'tts_chars_done', type: 'int', default: 0 })
    ttsCharsDone!: number;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
    updatedAt!: Date;
}
