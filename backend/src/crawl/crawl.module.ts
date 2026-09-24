import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from 'src/chapters/chapters.entity';
import { Novel } from 'src/novels/entities/novel.entity';
import { NovelsModule } from 'src/novels/novels.module';
import { CrawlController } from './crawl.controller';
import { CrawlService } from './crawl.service';
import { CrawlWorkerService } from './crawl-worker.service';
import { CrawlJobChapter } from './entities/crawl-job-chapter.entity';
import { CrawlJob } from './entities/crawl-job.entity';

@Module({
    imports: [TypeOrmModule.forFeature([CrawlJob, CrawlJobChapter, Chapter, Novel]), NovelsModule],
    controllers: [CrawlController],
    providers: [CrawlService, CrawlWorkerService],
})
export class CrawlModule {}
