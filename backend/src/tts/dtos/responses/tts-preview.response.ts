import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TtsChapterPreview {
    @ApiPropertyOptional({ nullable: true })
    error!: string | null;

    @ApiPropertyOptional({ nullable: true, example: '1–10, 15 (11 chương, bỏ qua chương đã có MP3)' })
    preview!: string | null;

    @ApiProperty()
    count!: number;

    @ApiProperty({ description: 'Số chương sẽ thực sự tạo (bỏ qua MP3 hợp lệ và chương rỗng)' })
    willRun!: number;
}

export class TtsPreviewResponse {
    @ApiProperty({ description: 'Chương có nội dung, chưa có MP3 hợp lệ' })
    missing!: number;

    @ApiProperty({ description: 'Trong số missing, chương tts_status = failed' })
    failed!: number;

    @ApiPropertyOptional({ type: TtsChapterPreview, nullable: true })
    chapters!: TtsChapterPreview | null;
}
