import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsBoolean, IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

export class CreateScheduleRequest {
    @IsInt()
    @Min(1)
    @ApiProperty({ example: 1 })
    novelId!: number;

    @IsArray()
    @ArrayNotEmpty()
    @IsInt({ each: true })
    @Min(0, { each: true })
    @Max(6, { each: true })
    @ApiProperty({ type: [Number], example: [1, 2, 3, 4, 5], description: '0 = Chủ nhật, 1 = Thứ 2 … 6 = Thứ 7' })
    daysOfWeek!: number[];

    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'Giờ phải có dạng HH:mm' })
    @ApiProperty({ example: '08:00' })
    timeOfDay!: string;

    @IsOptional()
    @IsBoolean()
    @ApiPropertyOptional({ default: true })
    autoCrawl?: boolean;

    @IsOptional()
    @IsBoolean()
    @ApiPropertyOptional({ default: true })
    autoTts?: boolean;

    @IsOptional()
    @IsBoolean()
    @ApiPropertyOptional({ default: true })
    autoDrive?: boolean;

    @IsOptional()
    @IsBoolean()
    @ApiPropertyOptional({ default: true, description: 'Lịch mới tạo mặc định hoạt động' })
    active?: boolean;
}
