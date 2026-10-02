import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { DRIVE_SCOPES, type DriveScope } from '../../entities/drive-upload-job.entity';

export class StartDriveJobRequest {
    @IsInt()
    @Min(1)
    @ApiProperty({ example: 1 })
    novelId!: number;

    @IsIn(DRIVE_SCOPES)
    @ApiProperty({ enum: DRIVE_SCOPES })
    scope!: DriveScope;

    @IsOptional()
    @IsString()
    @MaxLength(2000)
    @ApiPropertyOptional({ description: 'Bắt buộc khi scope=chapters. Cùng format TTS: 10 | 5-10 | 1,2,5' })
    chapterRange?: string;
}