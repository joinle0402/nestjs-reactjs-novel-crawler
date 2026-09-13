import { Novel } from "src/novels/entities/novel.entity";
import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Chapter {
    @PrimaryGeneratedColumn()
    id!: number;

    @ManyToOne(() => Novel, (novel) => novel.chapters)
    novel!: Novel;

    @Column({ name: 'novel_id' })
    novelId!: number;

    @Column({ name: 'chapter_site_id' })
    chapterSiteId!: string;

    @Column({ name: 'chapter_number' })
    chapterNumber!: number;

    @Column()
    title!: string;

    @Column({ type: 'text', nullable: true })
    content!: string | null;

    @Column({ name: 'crawl_status', type: 'varchar', length: 20, nullable: true })
    crawlStatus!: string | null;

    @Column({ name: 'tts_status', type: 'varchar', length: 20, nullable: true })
    ttsStatus!: string | null;

    @Column({ name: 'has_mp3', default: false })
    hasMp3!: boolean;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
    updatedAt!: Date;
}