import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { TTS_ENGINES } from '../../entities/tts-job.entity';

export class TtsSavedSampleQuery {
    @IsIn(TTS_ENGINES)
    @ApiProperty({ enum: TTS_ENGINES, example: 'vieneu' })
    engine!: string;

    @IsString()
    @MaxLength(128)
    @ApiProperty({ example: 'Hải Đăng' })
    voice!: string;

    @Matches(/^[+-]\d+%$/)
    @ApiProperty({ example: '+50%' })
    rate!: string;
}
