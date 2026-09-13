import { Chapter } from 'src/chapters/chapters.entity';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';

@Entity('novels')
export class Novel {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', length: 2048 })
    url!: string;

    @Column({ type: 'varchar', length: 500 })
    title!: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    author!: string | null;

    @Column({ type: 'text', nullable: true })
    summary!: string | null;

    @CreateDateColumn({ name: 'created_at', type: 'datetime' })
    createdAt!: Date;

    @OneToMany(() => Chapter, (chapter) => chapter.novel)
    chapters!: Chapter[];
}
