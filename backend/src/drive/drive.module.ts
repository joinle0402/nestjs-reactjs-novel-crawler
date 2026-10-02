import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from 'src/chapters/chapters.entity';
import { NovelsModule } from 'src/novels/novels.module';
import { DriveUploadJob } from './entities/drive-upload-job.entity';
import { DriveController } from './drive.controller';
import { DriveService } from './drive.service';
import { DriveWorkerService } from './drive-worker.service';

@Module({
    imports: [TypeOrmModule.forFeature([DriveUploadJob, Chapter]), NovelsModule],
    controllers: [DriveController],
    providers: [DriveService, DriveWorkerService],
})
export class DriveModule {}