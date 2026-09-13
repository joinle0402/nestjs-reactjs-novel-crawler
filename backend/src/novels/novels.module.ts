import { Module } from '@nestjs/common';
import { NovelsController } from './novels.controller';
import { NovelsService } from './novels.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Novel } from './entities/novel.entity';

@Module({
    imports: [
        TypeOrmModule.forFeature([Novel]),
    ],
    controllers: [NovelsController],
    providers: [NovelsService]
})
export class NovelsModule { }
