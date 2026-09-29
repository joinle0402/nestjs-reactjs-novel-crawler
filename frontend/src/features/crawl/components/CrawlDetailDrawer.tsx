import { Alert, Button, Drawer, Progress, Radio, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
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

type CrawlDetailDrawerProps = {
    job: CrawlJob | null;
    chapters: CrawlJobChapter[];
    chaptersLoading: boolean;
    chapterFilter: CrawlChapterStatus | '';
    activeJobId: number | null;
    actionPending: boolean;
    onChapterFilter: (value: CrawlChapterStatus | '') => void;
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

export function CrawlDetailDrawer({
    job,
    chapters,
    chaptersLoading,
    chapterFilter,
    activeJobId,
    actionPending,
    onChapterFilter,
    onClose,
    onAction,
    onEdit,
    onClone,
    onDelete,
}: CrawlDetailDrawerProps) {
    const [logOpen, setLogOpen] = useState(false);
    const blockedByOther = activeJobId != null && activeJobId !== job?.id;

    const chapterColumns: ColumnsType<CrawlJobChapter> = [
        { title: 'Chương', dataIndex: 'chapterNumber', width: 90 },
        { title: 'Tên', dataIndex: 'title', ellipsis: true },
        {
            title: 'Kết quả',
            dataIndex: 'status',
            width: 120,
            render: (status: CrawlChapterStatus) => <Tag color={statusColor(status)}>{status}</Tag>,
        },
        { title: 'Lần thử', dataIndex: 'attemptCount', width: 90 },
        { title: 'Lỗi', dataIndex: 'errorMessage', ellipsis: true },
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
                    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                        <div>
                            {job.novelId ? <Link to={`/novels/${job.novelId}`}>{job.novelTitle || job.url}</Link> : job.url}
                            <Typography.Text type="secondary"> — {job.progress.detail}</Typography.Text>
                        </div>
                        <Typography.Text type="secondary">
                            Phạm vi: {job.scope === 'chapters' ? job.chapterRange || 'khoảng chương' : job.scope === 'missing' ? 'chương chưa có nội dung' : 'chương lỗi'}
                        </Typography.Text>
                        <Progress percent={job.progress.percent ?? 0} status={job.progress.percent == null ? 'active' : undefined} />
                        <Space size={24} wrap>
                            <span>Hoàn thành: {job.progress.completed}</span>
                            <span>Bỏ qua: {job.progress.skipped}</span>
                            <span>Thất bại: {job.progress.failed}</span>
                            <span>Còn lại: {job.progress.pending}</span>
                            <span>Thời gian: {elapsed(job.startedAt, job.finishedAt)}</span>
                        </Space>
                        {job.status === 'waiting_for_manual_action' ? (
                            <Alert type="warning" showIcon title="Cần thao tác trên Chrome do worker mở" description={job.errorMessage || 'Giải captcha nếu có, đợi trang load, rồi bấm Tiếp tục.'} />
                        ) : null}
                        {job.errorMessage && job.status !== 'waiting_for_manual_action' ? <Alert type="error" showIcon title={job.errorMessage} /> : null}
                        {canResumeCrawlJob(job.status) ? (
                            <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                                Tiếp tục chạy lại đúng task này. Worker bỏ qua chương đã có nội dung.
                            </Typography.Paragraph>
                        ) : null}
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
                        <Radio.Group
                            value={chapterFilter}
                            onChange={(event) => onChapterFilter(event.target.value)}
                            options={[
                                { label: 'Mọi chương', value: '' },
                                { label: 'Lỗi', value: 'failed' },
                                { label: 'Đang chạy', value: 'running' },
                                { label: 'Xong', value: 'completed' },
                                { label: 'Bỏ qua', value: 'skipped' },
                            ]}
                            optionType="button"
                        />
                        <Table
                            rowKey="id"
                            size="small"
                            columns={chapterColumns}
                            dataSource={chapters}
                            loading={chaptersLoading}
                            pagination={{ pageSize: 20, showSizeChanger: false }}
                            locale={{ emptyText: job.progress.total === 0 ? 'Worker đang lấy danh sách chương' : 'Chưa có dòng chương' }}
                        />
                    </Space>
                ) : null}
            </Drawer>
            <CrawlLogDrawer open={logOpen} jobId={job?.id ?? null} title={job?.novelTitle || job?.url || ''} onClose={() => setLogOpen(false)} />
        </>
    );
}
