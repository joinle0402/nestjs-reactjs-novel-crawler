import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DRIVE_JOB_STATUSES, DRIVE_SCOPES, type DriveFailedFile, type DriveJobStatus, type DriveScope } from '../../entities/drive-upload-job.entity';

export class DriveJobProgress {
    @ApiProperty({ description: 'Số file đã upload' })
    done!: number;

    @ApiProperty({ description: 'Số file bỏ qua vì đã có trên Drive' })
    skipped!: number;

    @ApiProperty({ description: 'Số file lỗi' })
    failed!: number;

    @ApiProperty({ description: 'Số file đã xử lý (upload + bỏ qua + lỗi)' })
    processed!: number;

    @ApiProperty()
    total!: number;

    @ApiProperty()
    percent!: number;

    @ApiPropertyOptional({ nullable: true })
    currentFile!: string | null;

    @ApiProperty({ example: 'upload 23/690 file · bỏ qua 660 · đang: 0695_....mp3' })
    detail!: string;
}

export class DriveJobResponse {
    @ApiProperty()
    id!: number;

    @ApiProperty()
    novelId!: number;

    @ApiProperty()
    novelTitle!: string;

    @ApiProperty({ enum: DRIVE_SCOPES })
    scope!: DriveScope;

    @ApiPropertyOptional({ nullable: true })
    chapterRange!: string | null;

    @ApiPropertyOptional({ type: [Number], nullable: true })
    chapterNumbers!: number[] | null;

    @ApiProperty({ enum: DRIVE_JOB_STATUSES })
    status!: DriveJobStatus;

    @ApiPropertyOptional({ nullable: true })
    startedAt!: Date | null;

    @ApiPropertyOptional({ nullable: true })
    finishedAt!: Date | null;

    @ApiPropertyOptional({ nullable: true })
    errorMessage!: string | null;

    @ApiProperty({ type: DriveJobProgress })
    progress!: DriveJobProgress;

    @ApiPropertyOptional({ type: Object, isArray: true })
    failedFiles!: DriveFailedFile[];
}