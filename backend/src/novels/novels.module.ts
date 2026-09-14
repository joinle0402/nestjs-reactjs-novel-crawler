import { Module } from '@nestjs/common';
import { NovelsController } from './novels.controller';
import { NovelsService } from './novels.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Novel } from './entities/novel.entity';
import { Chapter } from 'src/chapters/chapters.entity';
import { PlaybackState } from './entities/playback-state.entity';

@Module({
    imports: [TypeOrmModule.forFeature([Novel, Chapter, PlaybackState])],
    controllers: [NovelsController],
    providers: [NovelsService],
    exports: [NovelsService],
})
export class NovelsModule {}
