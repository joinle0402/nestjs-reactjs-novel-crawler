export const JobStatus = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
    pending: 'Chờ',
    processing: 'Đang chạy',
    completed: 'Xong',
    failed: 'Lỗi',
    skipped: 'Bỏ qua',
};

export const JOB_STATUS_COLOR: Record<JobStatus, string> = {
    pending: 'default',
    processing: 'processing',
    completed: 'success',
    failed: 'error',
    skipped: 'warning',
};

export const JOB_STATUS_OPTIONS = Object.values(JobStatus).map((value) => ({
    value,
    label: JOB_STATUS_LABEL[value],
}));
