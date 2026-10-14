import { Module } from '@nestjs/common';
import { BgmController } from './bgm.controller';
import { BgmService } from './bgm.service';

@Module({
    controllers: [BgmController],
    providers: [BgmService],
    exports: [BgmService],
})
export class BgmModule {}
