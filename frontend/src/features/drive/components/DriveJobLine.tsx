import { Button, message, Popconfirm, Progress, Space, Tag, Tooltip, Typography } from 'antd';
import { FileTextOutlined, SyncOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    DRIVE_JOB_STATUS_COLOR,
    DRIVE_JOB_STATUS_LABEL,
    type DriveJob,
} from '@/features/drive/api/driveApi.ts';
import { DriveDetailDrawer, type DriveFileFilter } from '@/features/drive/components/DriveDetailDrawer.tsx';
import { DriveLogDrawer } from '@/features/drive/components/DriveLogDrawer.tsx';
import { useStopDriveJobMutation } from '@/features/drive/hooks/useDriveQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

type DriveJobLineProps = {
    job: DriveJob;
};

export function DriveJobLine({ job }: DriveJobLineProps) {
    const [detailOpen, setDetailOpen] = useState(false);
    const [detailFilter, setDetailFilter] = useState<DriveFileFilter>('');
    const [logOpen, setLogOpen] = useState(false);
    const stopMutation = useStopDriveJobMutation();

    const isRunning = job.status === 'running';
    const isPending = job.status === 'pending';
    const { processed, total, failed, percent } = job.progress;

    const openDetail = (filter: DriveFileFilter = '') => {
        setDetailFilter(filter);
        setDetailOpen(true);
    };

    return (
        <>
            <div className="tts-job-line" role="region" aria-label="Tiến độ upload Drive">
                <Tag icon={isRunning ? <SyncOutlined spin /> : undefined} color={DRIVE_JOB_STATUS_COLOR[job.status]} className="tts-job-line__status">
                    {DRIVE_JOB_STATUS_LABEL[job.status]}
                </Tag>
                <Typography.Text ellipsis className="tts-job-line__text">
                    <Link to={`/novels/${job.novelId}`} onClick={(event) => event.stopPropagation()}>
                        {job.novelTitle}
                    </Link>
                </Typography.Text>
                {isRunning ? (
                    <Typography.Text type="secondary" className="tts-job-line__current">
                        {`Đang upload: ${processed}/${total} file${job.progress.currentFile ? ` — ${job.progress.currentFile}` : ''}`}
                    </Typography.Text>
                ) : null}
                <div className="tts-job-line__progress" onClick={(event) => event.stopPropagation()}>
                    <Progress percent={percent ?? 0} size="small" status={isRunning || isPending ? 'active' : undefined} />
                </div>
                {failed > 0 ? (
                    <Tooltip title="Xem các file lỗi">
                        <Tag
                            color="error"
                            className="tts-job-line__failed"
                            onClick={(event) => {
                                event.stopPropagation();
                                openDetail('failed');
                            }}
                        >
                            {failed} lỗi
                        </Tag>
                    </Tooltip>
                ) : null}
                <Space size={4} className="tts-job-line__actions" onClick={(event) => event.stopPropagation()}>
                    <Button size="small" icon={<FileTextOutlined />} onClick={() => setLogOpen(true)}>
                        Log
                    </Button>
                    <Button size="small" onClick={() => openDetail()}>
                        Chi tiết
                    </Button>
                    <Popconfirm
                        title="Dừng upload Drive?"
                        description="File đang upload sẽ hoàn tất, các file sau sẽ dừng lại."
                        okText="Dừng"
                        okType="danger"
                        cancelText="Đóng"
                        onConfirm={() =>
                            stopMutation.mutate(undefined, {
                                onSuccess: () => message.success('Đã yêu cầu dừng upload Drive'),
                                onError: (error) => message.error(getErrorMessage(error, 'Không dừng được upload Drive')),
                            })
                        }
                    >
                        <Button size="small" danger loading={stopMutation.isPending}>
                            Dừng
                        </Button>
                    </Popconfirm>
                </Space>
            </div>
            <DriveDetailDrawer job={detailOpen ? job : null} initialFilter={detailFilter} onClose={() => setDetailOpen(false)} />
            <DriveLogDrawer open={logOpen} title={job.novelTitle} onClose={() => setLogOpen(false)} />
        </>
    );
}