import { axiosClient } from '@/shared/api/axiosClient.ts';

export type DriveScope = 'missing' | 'chapters';
export type DriveJobStatus = 'pending' | 'running' | 'stopped' | 'completed' | 'failed';

export type DriveFailedFile = {
    chapterNumber: number;
    name: string;
    error: string;
};

export type DriveFileResult = {
    chapterNumber: number;
    name: string;
    status: 'uploaded' | 'skipped' | 'failed';
    error?: string;
};

export type DriveJobProgress = {
    done: number;
    skipped: number;
    failed: number;
    processed: number;
    total: number;
    percent: number;
    currentFile: string | null;
    detail: string;
};

export type DriveJob = {
    id: number;
    novelId: number;
    novelTitle: string;
    scope: DriveScope;
    chapterRange: string | null;
    chapterNumbers: number[] | null;
    status: DriveJobStatus;
    startedAt: string | null;
    finishedAt: string | null;
    errorMessage: string | null;
    progress: DriveJobProgress;
    failedFiles: DriveFailedFile[];
    fileResults: DriveFileResult[];
};

export type DriveStatus = {
    credentialsReady: boolean;
    tokenReady: boolean;
};

export type DriveChaptersPreview = {
    error: string | null;
    preview: string | null;
    count: number;
    willRun: number;
    willRunBytes: number;
    willRunMissing: number | null;
};

export type DrivePreview = {
    totalFiles: number;
    totalBytes: number;
    missingOnDrive: number | null;
    missingBytes: number | null;
    driveChecked: boolean;
    driveFolder: string | null;
    driveFolderId: string | null;
    existingNames: string[] | null;
    chapters: DriveChaptersPreview | null;
};

export type StartDriveJobBody = {
    novelId: number;
    scope: DriveScope;
    chapterRange?: string;
};

export function isActiveDriveJob(job: DriveJob | null | undefined): boolean {
    return job?.status === 'pending' || job?.status === 'running';
}

export const DRIVE_JOB_STATUS_LABEL: Record<DriveJobStatus, string> = {
    pending: 'Chờ upload',
    running: 'Đang upload',
    stopped: 'Đã dừng',
    completed: 'Hoàn tất',
    failed: 'Thất bại',
};

export const DRIVE_JOB_STATUS_COLOR: Record<DriveJobStatus, string> = {
    pending: 'default',
    running: 'processing',
    stopped: 'warning',
    completed: 'success',
    failed: 'error',
};

export const getDriveStatus = () => axiosClient.get<DriveStatus>('/drive/status');

export const getDrivePreview = (novelId: number, chapterRange?: string) =>
    axiosClient.get<DrivePreview>('/drive/preview', {
        params: {
            novelId,
            ...(chapterRange ? { chapterRange } : {}),
        },
    });

export const getCurrentDriveJob = () => axiosClient.get<DriveJob | null>('/drive/jobs/current');

export const getLastDriveJob = (novelId: number) =>
    axiosClient.get<DriveJob | null>('/drive/jobs/last', {
        params: { novelId },
    });

export const getDriveLogs = (lines = 150) =>
    axiosClient.get<{ lines: string[] }>('/drive/jobs/logs', {
        params: { lines },
    });

export const startDriveJob = (body: StartDriveJobBody) => axiosClient.post<DriveJob>('/drive/jobs', body);

export const stopDriveJob = () => axiosClient.post<DriveJob>('/drive/jobs/stop');