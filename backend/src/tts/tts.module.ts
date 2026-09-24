import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from 'src/chapters/chapters.entity';
import { NovelsModule } from 'src/novels/novels.module';
import { TtsJob } from './entities/tts-job.entity';
import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';
import { TtsSettingsService } from './tts-settings.service';
import { TtsWorkerService } from './tts-worker.service';

@Module({
    imports: [TypeOrmModule.forFeature([TtsJob, Chapter]), NovelsModule],
    controllers: [TtsController],
    providers: [TtsService, TtsSettingsService, TtsWorkerService],
})
export class TtsModule {}
