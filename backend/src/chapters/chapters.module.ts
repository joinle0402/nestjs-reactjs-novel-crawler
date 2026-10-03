import { Module } from '@nestjs/common';
import { ChaptersService } from './chapters.service';
import { ChaptersController } from './chapters.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from './chapters.entity';
import { NovelsModule } from 'src/novels/novels.module';
import { DriveModule } from 'src/drive/drive.module';

@Module({
    imports: [
        TypeOrmModule.forFeature([Chapter]),
        NovelsModule,
        DriveModule,
    ],
    exports: [ChaptersService],
    providers: [ChaptersService],
    controllers: [ChaptersController]
})
export class ChaptersModule { }
