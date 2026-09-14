import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, Min } from 'class-validator';

export class UpdatePlaybackRequest {
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @ApiProperty({ description: 'Số chương đang nghe', example: 1 })
    chapterNumber!: number;

    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @ApiProperty({ description: 'Vị trí phát (giây)', example: 12.5 })
    positionSec!: number;
}
