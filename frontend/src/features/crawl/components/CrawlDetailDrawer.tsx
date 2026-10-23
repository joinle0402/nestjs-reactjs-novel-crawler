import { Alert, Button, Drawer, Progress, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    CRAWL_CHAPTER_STATUS_LABEL,
    CRAWL_STATUS_LABEL,
    canEditCrawlJob,
    canResumeCrawlJob,
    isActiveCrawlJob,
    type CrawlChapterStatus,
    type CrawlJob,
    type CrawlJobChapter,
    type CrawlJobStatus,
} from '@/features/crawl/api/crawlApi.ts';
import { CrawlLogDrawer } from '@/features/crawl/components/CrawlLogDrawer.tsx';
import { CrawlRestTag } from '@/features/crawl/components/CrawlRestTag.tsx';

type CrawlDetailDrawerProps = {
    job: CrawlJob | null;
    chapters: CrawlJobChapter[];
    chaptersLoading: boolean;
    activeJobId: number | null;
    actionPending: boolean;
    onClose: () => void;
    onAction: (action: 'pause' | 'resume' | 'continue' | 'cancel' | 'retry', id: number) => void;
    onEdit?: (job: CrawlJob) => void;
    onClone?: (job: CrawlJob) => void;
    onDelete?: (job: CrawlJob) => void;
};

function statusColor(status: CrawlJobStatus | CrawlChapterStatus): string {
    if (status === 'completed' || status === 'skipped') {
        return 'success';
    }
    if (status === 'failed' || status === 'completed_with_errors') {
        return 'error';
    }
    if (status === 'running' || status === 'waiting_for_manual_action') {
        return 'processing';
    }
    if (status === 'cancelled') {
        return 'default';
    }
    return 'warning';
}

function elapsed(startedAt: string | null, finishedAt: string | null): string {
    if (!startedAt) {
        return '—';
    }
    const end = finishedAt ? new Date(finishedAt).getTime() : Date.now();
    const seconds = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map((part) => String(part).padStart(2, '0')).join(':');
}

function scopeText(job: CrawlJob): string {
    if (job.scope === 'chapters') {
        return `Phạm vi ${job.chapterRange || 'khoảng chương'}`;
    }
    if (job.scope === 'missing') {
        return 'Chương chưa có nội dung';
    }
    if (job.scope === 'failed') {
        return 'Chương lỗi';
    }
    if (job.scope === 'refresh') {
        return 'Cập nhật chương mới';
    }
    return job.scope;
}

function progressText(job: CrawlJob): string {
    const { progress } = job;
    if (progress.total === 0) {
        return progress.detail;
    }
    return [
        job.status === 'running' && progress.currentChapterNumber != null ? `Chương ${progress.currentChapterNumber}` : null,
        `Hoàn thành ${progress.completed}/${progress.total}`,
        `Còn lại ${progress.pending}`,
        progress.failed > 0 ? `Lỗi ${progress.failed}` : null,
        progress.skipped > 0 ? `Bỏ qua ${progress.skipped}` : null,
        `Thời gian ${elapsed(job.startedAt, job.finishedAt)}`,
    ]
        .filter((part): part is string => part !== null)
        .join(' · ');
}

export function CrawlDetailDrawer({
    job,
    chapters,
    chaptersLoading,
    activeJobId,
    actionPending,
    onClose,
    onAction,
    onEdit,
    onClone,
    onDelete,
}: CrawlDetailDrawerProps) {
    const [logOpen, setLogOpen] = useState(false);
    const blockedByOther = activeJobId != null && activeJobId !== job?.id;
    const orderOf = useMemo(() => {
        const map = new Map<number, number>();
        chapters.forEach((row, index) => map.set(row.id, index + 1));
        return map;
    }, [chapters]);

    const chapterColumns: ColumnsType<CrawlJobChapter> = [
        {
            title: 'STT',
            key: 'order',
            width: 56,
            align: 'right',
            render: (_value, row) => orderOf.get(row.id) ?? 0,
        },
        {
            title: 'Tên',
            dataIndex: 'title',
            ellipsis: true,
            render: (title: string | null, row) => title || `Chương ${row.chapterNumber}`,
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 130,
            render: (status: CrawlChapterStatus) => <Tag color={statusColor(status)}>{CRAWL_CHAPTER_STATUS_LABEL[status]}</Tag>,
        },
    ];

    return (
        <>
            <Drawer
                title={job ? `Task #${job.id}` : 'Chi tiết task'}
                placement="right"
                size={720}
                open={job !== null}
                onClose={onClose}
                extra={job ? <Tag color={statusColor(job.status)}>{CRAWL_STATUS_LABEL[job.status]}</Tag> : null}
            >
                {job ? (
                    <Space orientation="vertical" size={10} style={{ width: '100%' }}>
                        <div className="crawl-detail__head">
                            <Typography.Text strong ellipsis className="crawl-detail__title">
                                {job.novelId ? <Link to={`/novels/${job.novelId}`}>{job.novelTitle || job.url}</Link> : job.url}
                            </Typography.Text>
                            <Tag style={{ marginInlineEnd: 0 }}>{scopeText(job)}</Tag>
                        </div>
                        <div className="crawl-detail__progress-row">
                            <Progress percent={job.progress.percent ?? 0} status={job.progress.percent == null ? 'active' : undefined} />
                            <Typography.Text type="secondary" className="crawl-detail__meta">
                                {progressText(job)}
                            </Typography.Text>
                        </div>
                        <CrawlRestTag restUntil={job.status === 'running' ? job.restUntil : null} restKind={job.restKind} />
                        {job.status === 'waiting_for_manual_action' ? <Alert type="warning" showIcon title="Cần thao tác trên Chrome do worker mở" /> : null}
                        {job.errorMessage && !isActiveCrawlJob(job) ? <Alert type="error" showIcon title={job.errorMessage} /> : null}
                        <Space wrap>
                            {job.status === 'running' ? (
                                <Button onClick={() => onAction('pause', job.id)} loading={actionPending}>
                                    Tạm dừng
                                </Button>
                            ) : null}
                            {canResumeCrawlJob(job.status) ? (
                                <Button type="primary" onClick={() => onAction('resume', job.id)} loading={actionPending} disabled={blockedByOther}>
                                    Tiếp tục
                                </Button>
                            ) : null}
                            {job.status === 'waiting_for_manual_action' ? (
                                <Button type="primary" onClick={() => onAction('continue', job.id)} loading={actionPending}>
                                    Đã xử lý, tiếp tục
                                </Button>
                            ) : null}
                            {isActiveCrawlJob(job) ? (
                                <Button danger onClick={() => onAction('cancel', job.id)} loading={actionPending}>
                                    Hủy tác vụ
                                </Button>
                            ) : null}
                            {onEdit && canEditCrawlJob(job.status) ? <Button onClick={() => onEdit(job)}>Sửa</Button> : null}
                            {onClone ? <Button onClick={() => onClone(job)}>Clone</Button> : null}
                            <Button onClick={() => setLogOpen(true)}>Xem log</Button>
                            {job.progress.failed > 0 ? (
                                <Button onClick={() => onAction('retry', job.id)} loading={actionPending} disabled={activeJobId != null}>
                                    Cào lại chương lỗi
                                </Button>
                            ) : null}
                            {!isActiveCrawlJob(job) && onDelete ? (
                                <Button danger onClick={() => onDelete(job)}>
                                    Xóa
                                </Button>
                            ) : null}
                        </Space>
                        {blockedByOther ? <Typography.Text type="secondary">Đang có task #{activeJobId}. Hủy task đó trước khi tiếp tục task này.</Typography.Text> : null}
                        <Table
                            className="crawl-chapter-table"
                            rowKey="id"
                            size="small"
                            columns={chapterColumns}
                            dataSource={chapters}
                            loading={chaptersLoading}
                            scroll={{ y: 'max(240px, calc(100vh - 310px))' }}
                            pagination={{ pageSize: 20, showSizeChanger: false, size: 'small' }}
                            locale={{ emptyText: job.progress.total === 0 ? 'Worker đang lấy danh sách chương' : 'Chưa có dòng chương' }}
                        />
                    </Space>
                ) : null}
            </Drawer>
            <CrawlLogDrawer open={logOpen} jobId={job?.id ?? null} title={job?.novelTitle || job?.url || ''} onClose={() => setLogOpen(false)} />
        </>
    );
}
