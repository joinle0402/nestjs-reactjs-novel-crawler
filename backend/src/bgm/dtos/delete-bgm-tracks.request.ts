import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength } from 'class-validator';

export class DeleteBgmTracksRequest {
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @IsString({ each: true })
    @MaxLength(80, { each: true })
    @ApiProperty({ type: [String] })
    ids!: string[];
}
