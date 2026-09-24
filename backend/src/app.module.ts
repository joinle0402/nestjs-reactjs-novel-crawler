import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Novel } from './novels/entities/novel.entity';
import { NovelsModule } from './novels/novels.module';
import { ChaptersModule } from './chapters/chapters.module';
import { Chapter } from './chapters/chapters.entity';
import { PlaybackState } from './novels/entities/playback-state.entity';
import { SqlQueryLogger } from './common/logging/sql-query.logger';
import { AudiosModule } from './audios/audios.module';
import { TtsModule } from './tts/tts.module';
import { TtsJob } from './tts/entities/tts-job.entity';
import { CrawlModule } from './crawl/crawl.module';
import { CrawlJob } from './crawl/entities/crawl-job.entity';
import { CrawlJobChapter } from './crawl/entities/crawl-job-chapter.entity';

@Module({
    imports: [
        HealthModule,
        ConfigModule.forRoot({
            isGlobal: true,
        }),

        TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => {
                const isDev = configService.get<string>('NODE_ENV') !== 'production';

                return {
                    type: 'mysql',
                    host: configService.get<string>('DB_HOST'),
                    port: configService.get<number>('DB_PORT'),
                    username: configService.get<string>('DB_USERNAME'),
                    password: configService.get<string>('DB_PASSWORD'),
                    database: configService.get<string>('DB_DATABASE'),
                    charset: 'utf8mb4',
                    entities: [Novel, Chapter, PlaybackState, TtsJob, CrawlJob, CrawlJobChapter],
                    synchronize: true,
                    logging: isDev,
                    logger: isDev ? new SqlQueryLogger() : undefined,
                    // -1 => log every query via logQuerySlow (with duration).
                    // Does not enable timeouts unless enableQueryTimeout is true.
                    maxQueryExecutionTime: isDev ? -1 : undefined,
                };
            },
        }),

        NovelsModule,
        ChaptersModule,
        AudiosModule,
        TtsModule,
        CrawlModule,
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule { }
