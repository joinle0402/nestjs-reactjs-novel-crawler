import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from 'src/chapters/chapters.entity';
import { CrawlModule } from 'src/crawl/crawl.module';
import { DriveModule } from 'src/drive/drive.module';
import { NovelsModule } from 'src/novels/novels.module';
import { TtsModule } from 'src/tts/tts.module';
import { CrawlSchedule } from './entities/schedule.entity';
import { SchedulesController } from './schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
    imports: [TypeOrmModule.forFeature([CrawlSchedule, Chapter]), NovelsModule, CrawlModule, TtsModule, DriveModule],
    controllers: [SchedulesController],
    providers: [SchedulesService],
})
export class SchedulesModule {}
