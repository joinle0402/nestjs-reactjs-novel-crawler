import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, IsUrl } from "class-validator";

export class CreateNovelRequest {
    @IsUrl()
    @IsNotEmpty()
    @ApiProperty({ description: 'URL của truyện', example: 'https://sangtacviet.com/truyen/qidian/1/1038661276/' })
    url!: string;

    @IsString()
    @IsNotEmpty()
    @ApiProperty({ description: 'Tiêu đề của truyện', example: 'Lộ ra ánh sáng lịch đại hoàng đế sáu chiều đồ, lão tổ tông luống cuống' })
    title!: string;

    @IsOptional()
    @IsString()
    @ApiProperty({ description: 'Tác giả của truyện', example: 'Cửu phẩm đại cửu thái', required: false })
    author?: string;

    @IsOptional()
    @IsString()
    @ApiProperty({
        description: 'Tóm tắt của truyện',
        example: 'Tóm tắt của truyện để đọc',
        required: false,
    })
    summary?: string;
}