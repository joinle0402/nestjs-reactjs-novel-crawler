import { Module } from '@nestjs/common';
import { NovelsController } from './novels.controller';
import { NovelsService } from './novels.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Novel } from './entities/novel.entity';
import { ChaptersModule } from 'src/chapters/chapters.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Novel]),
    ],
    controllers: [NovelsController],
    providers: [NovelsService],
    exports: [
        NovelsService,
    ],
})
export class NovelsModule { }
