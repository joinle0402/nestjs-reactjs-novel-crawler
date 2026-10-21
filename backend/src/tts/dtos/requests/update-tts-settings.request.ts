import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { TTS_ENGINES } from '../../entities/tts-job.entity';

export class UpdateTtsSettingsRequest {
    @IsIn(TTS_ENGINES)
    @ApiProperty({ enum: TTS_ENGINES, example: 'vieneu' })
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

    /** 0 = không tự tắt engine offline. */
    @IsInt()
    @Min(0)
    @Max(1440)
    @ApiProperty({ example: 10, description: 'Số phút giữ engine offline ấm sau lần dùng cuối; 0 = không tự tắt' })
    engineIdleMinutes!: number;
}
