import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { TTS_ENGINES } from '../../entities/tts-job.entity';

export class TtsSampleRequest {
    @IsIn(TTS_ENGINES)
    @ApiProperty({ enum: TTS_ENGINES, example: 'edge-tts' })
    engine!: string;

    @IsString()
    @MaxLength(128)
    @ApiProperty({ example: 'vi-VN-HoaiMyNeural' })
    voice!: string;

    @Matches(/^[+-]\d+%$/)
    @ApiProperty({ example: '+0%' })
    rate!: string;

    @IsString()
    @MinLength(1)
    @MaxLength(500)
    @ApiProperty({ example: 'Xin chào. Đây là đoạn thử giọng đọc.' })
    text!: string;
}
