import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DriveChaptersPreview {
    @ApiPropertyOptional({ nullable: true, description: 'Lỗi parse phạm vi' })
    error!: string | null;

    @ApiPropertyOptional({ nullable: true })
    preview!: string | null;

    @ApiProperty({ description: 'Số chương có MP3 trong phạm vi' })
    count!: number;

    @ApiProperty({ description: 'Số file sẽ xử lý trong phạm vi' })
    willRun!: number;

    @ApiProperty({ description: 'Dung lượng ước tính của phạm vi (byte)' })
    willRunBytes!: number;

    @ApiPropertyOptional({ nullable: true, description: 'Số file thiếu trên Drive trong phạm vi. Null khi chưa kiểm tra được Drive' })
    willRunMissing!: number | null;
}

export class DrivePreviewResponse {
    @ApiProperty({ description: 'Tổng số chương có MP3' })
    totalFiles!: number;

    @ApiProperty({ description: 'Tổng dung lượng MP3 (byte)' })
    totalBytes!: number;

    @ApiPropertyOptional({ nullable: true, description: 'Số file chưa có trên Drive. Null khi không kiểm tra được Drive' })
    missingOnDrive!: number | null;

    @ApiPropertyOptional({ nullable: true, description: 'Dung lượng ước tính phần thiếu (byte)' })
    missingBytes!: number | null;

    @ApiProperty({ description: 'Đã kiểm tra Drive thành công hay không' })
    driveChecked!: boolean;

    @ApiPropertyOptional({ nullable: true, description: 'Đường dẫn thư mục đích trên Drive' })
    driveFolder!: string | null;

    @ApiPropertyOptional({ nullable: true, description: 'ID thư mục Drive của truyện (dùng tạo link)' })
    driveFolderId!: string | null;

    @ApiPropertyOptional({ type: [String], nullable: true, description: 'Tên các file MP3 đã có trên Drive. Null khi không kiểm tra được Drive' })
    existingNames!: string[] | null;

    @ApiPropertyOptional({ type: DriveChaptersPreview, nullable: true })
    chapters!: DriveChaptersPreview | null;
}