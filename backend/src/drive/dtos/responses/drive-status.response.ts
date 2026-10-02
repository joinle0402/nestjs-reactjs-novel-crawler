import { ApiProperty } from '@nestjs/swagger';

export class DriveStatusResponse {
    @ApiProperty({ description: 'Có file OAuth client_secret.json trong worker/' })
    credentialsReady!: boolean;

    @ApiProperty({ description: 'Có token.json đã đăng nhập Google Drive' })
    tokenReady!: boolean;
}