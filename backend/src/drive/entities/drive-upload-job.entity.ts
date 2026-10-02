import { Novel } from 'src/novels/entities/novel.entity';
import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export const DRIVE_SCOPES = ['missing', 'chapters'] as const;
export type DriveScope = (typeof DRIVE_SCOPES)[number];

export const DRIVE_JOB_STATUSES = ['pending', 'running', 'stopped', 'completed', 'failed'] as const;
export type DriveJobStatus = (typeof DRIVE_JOB_STATUSES)[number];

export type DriveFailedFile = {
    chapterNumber: number;
    name: string;
    error: string;
};

@Entity('drive_upload_jobs')
@Index('idx_drive_upload_jobs_status', ['status'])
export class DriveUploadJob {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => Novel, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'novel_id' })
    novel!: Novel;

    @Column({ name: 'novel_id' })
    novelId!: number;

    @Column({ type: 'varchar', length: 20 })
    scope!: DriveScope;

    @Column({ name: 'chapter_range', type: 'varchar', length: 2000, nullable: true })
    chapterRange!: string | null;

    @Column({ name: 'chapter_numbers', type: 'json', nullable: true })
    chapterNumbers!: number[] | null;

    @Column({ type: 'varchar', length: 20 })
    status!: DriveJobStatus;

    @Column({ name: 'total_files', type: 'int', default: 0 })
    totalFiles!: number;

    @Column({ name: 'uploaded_count', type: 'int', default: 0 })
    uploadedCount!: number;

    @Column({ name: 'skipped_count', type: 'int', default: 0 })
    skippedCount!: number;

    @Column({ name: 'failed_count', type: 'int', default: 0 })
    failedCount!: number;

    @Column({ name: 'current_file', type: 'varchar', length: 255, nullable: true })
    currentFile!: string | null;

    @Column({ name: 'failed_files', type: 'json', nullable: true })
    failedFiles!: DriveFailedFile[] | null;

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