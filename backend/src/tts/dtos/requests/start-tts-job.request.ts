import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { TTS_ENGINES, TTS_SCOPES, type TtsScope } from '../../entities/tts-job.entity';

export class StartTtsJobRequest {
    @IsInt()
    @Min(1)
    @ApiProperty({ example: 1 })
    novelId!: number;

    @IsIn(TTS_SCOPES)
    @ApiProperty({ enum: TTS_SCOPES })
    scope!: TtsScope;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    @ApiPropertyOptional({ description: 'Bắt buộc khi scope=chapters. Cùng format console: 10 | 5-10 | 1,2,5 | all' })
    chapterRange?: string;

    @IsOptional()
    @IsIn(TTS_ENGINES)
    @ApiPropertyOptional({ enum: TTS_ENGINES, example: 'vieneu' })
    engine?: string;

    @IsOptional()
    @IsString()
    @MaxLength(128)
    @ApiPropertyOptional({ example: 'vi-VN-HoaiMyNeural' })
    voice?: string;

    @IsOptional()
    @Matches(/^[+-]\d+%$/)
    @ApiPropertyOptional({ example: '+50%', description: 'Thiếu thì lấy mặc định trong tts_settings.json' })
    rate?: string;

    @IsOptional()
    @IsBoolean()
    @ApiPropertyOptional()
    bgmEnabled?: boolean;
}
