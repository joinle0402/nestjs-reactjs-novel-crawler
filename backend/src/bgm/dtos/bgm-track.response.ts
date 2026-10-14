import { ApiProperty } from '@nestjs/swagger';

export class BgmTrackResponse {
    @ApiProperty()
    id!: string;

    @ApiProperty()
    name!: string;

    @ApiProperty()
    fileName!: string;

    @ApiProperty()
    createdAt!: string;
}
