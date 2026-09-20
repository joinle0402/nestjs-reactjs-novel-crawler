import { Module } from '@nestjs/common';
import { AudiosService } from './audios.service';
import { AudiosController } from './audios.controller';
import { ChaptersModule } from 'src/chapters/chapters.module';

@Module({
    providers: [AudiosService],
    controllers: [AudiosController],
    imports: [
        ChaptersModule,
    ],
})
export class AudiosModule { }
