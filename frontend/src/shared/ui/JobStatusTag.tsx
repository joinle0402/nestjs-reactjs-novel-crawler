import { Tag } from 'antd';
import { JOB_STATUS_COLOR, JOB_STATUS_LABEL, type JobStatus } from '@/shared/types/jobStatus.ts';

type JobStatusTagProps = {
    status: JobStatus | string;
    prefix?: string;
};

export function JobStatusTag({ status, prefix }: JobStatusTagProps) {
    const value = status as JobStatus;
    const label = JOB_STATUS_LABEL[value] ?? status;
    const color = JOB_STATUS_COLOR[value] ?? 'default';
    return <Tag color={color}>{prefix ? `${prefix}: ${label}` : label}</Tag>;
}
