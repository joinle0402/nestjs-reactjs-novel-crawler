import { ApiProperty } from '@nestjs/swagger';

export class SyncNovelChaptersResponse {
    @ApiProperty({ description: 'Số chương mới được thêm vào danh sách' })
    synced!: number;

    @ApiProperty({ description: 'Tổng số chương miễn phí trên trang nguồn' })
    total!: number;

    @ApiProperty({ description: 'Số chương VIP bị bỏ qua' })
    vipCount!: number;
}
