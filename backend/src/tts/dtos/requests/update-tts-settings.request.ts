import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsString, Matches, MaxLength } from 'class-validator';
import { TTS_ENGINE } from '../../entities/tts-job.entity';

export class UpdateTtsSettingsRequest {
    @IsIn([TTS_ENGINE])
    @ApiProperty({ example: TTS_ENGINE })
    engine!: string;

    @IsString()
    @MaxLength(128)
    @ApiProperty({ example: 'vi-VN-HoaiMyNeural' })
    voice!: string;

    @Matches(/^[+-]\d+%$/)
    @ApiProperty({ example: '+50%' })
    rate!: string;

    @IsBoolean()
    @ApiProperty()
    bgmEnabled!: boolean;
}
