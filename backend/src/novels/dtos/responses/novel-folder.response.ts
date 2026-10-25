import { ApiProperty } from '@nestjs/swagger';

export class NovelFolderResponse {
    @ApiProperty({ description: 'Đường dẫn tuyệt đối của thư mục đã mở' })
    folderPath!: string;

    @ApiProperty({ description: 'True khi tìm thấy thư mục MP3 riêng của truyện' })
    found!: boolean;
}
