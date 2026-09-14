import { Column, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Novel } from './novel.entity';

@Entity('playback_state')
export class PlaybackState {
    @PrimaryColumn({ name: 'novel_id' })
    novelId!: number;

    @OneToOne(() => Novel, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'novel_id' })
    novel!: Novel;

    @Column({ name: 'chapter_number', type: 'int' })
    chapterNumber!: number;

    @Column({ name: 'position_sec', type: 'double', default: 0 })
    positionSec!: number;

    @UpdateDateColumn({ name: 'updated_at', type: 'datetime' })
    updatedAt!: Date;
}
