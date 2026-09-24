import { Alert, Button, Card, Form, Input, Progress, Radio, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
    CRAWL_STATUS_LABEL,
    isActiveCrawlJob,
    type CrawlChapterStatus,
    type CrawlJob,
    type CrawlJobChapter,
    type CrawlJobStatus,
    type CrawlScope,
} from '@/features/crawl/api/crawlApi.ts';
import {
    useCrawlActionMutation,
    useCrawlChaptersQuery,
    useCrawlJobQuery,
    useCrawlJobsQuery,
    useCrawlLookupQuery,
    useCreateCrawlJobMutation,
    useCurrentCrawlJobQuery,
} from '@/features/crawl/hooks/useCrawlQueries.ts';
import { useNovelQuery } from '@/features/novels/hooks/useNovelQuery.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';
import { parseRouteId } from '@/shared/lib/parseRouteId.ts';

const STATUS_FILTERS: { label: string; value: CrawlJobStatus | '' }[] = [
    { label: 'Tất cả', value: '' },
    { label: 'Đang chạy', value: 'running' },
    { label: 'Chờ', value: 'pending' },
    { label: 'Chờ thao tác', value: 'waiting_for_manual_action' },
    { label: 'Hoàn thành', value: 'completed' },
    { label: 'Có lỗi', value: 'completed_with_errors' },
    { label: 'Lỗi', value: 'failed' },
    { label: 'Đã hủy', value: 'cancelled' },
];

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

type FormValues = {
    url: string;
    scope: CrawlScope;
    chapterRange?: string;
};

export function CrawlPage() {
    const [params] = useSearchParams();
    const novelId = parseRouteId(params.get('novelId') ?? undefined);
    const novelQuery = useNovelQuery(novelId);
    const [form] = Form.useForm<FormValues>();
    const url = Form.useWatch('url', form) ?? '';
    const scope = Form.useWatch('scope', form) ?? 'missing';
    const lookupQuery = useCrawlLookupQuery(url);
    const currentQuery = useCurrentCrawlJobQuery();
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<CrawlJobStatus | ''>('');
    const [page, setPage] = useState(1);
    const [chapterFilter, setChapterFilter] = useState<CrawlChapterStatus | ''>('');
    const jobsQuery = useCrawlJobsQuery(statusFilter, page);
    const active = currentQuery.data && isActiveCrawlJob(currentQuery.data) ? currentQuery.data : null;
    const detailId = selectedId ?? active?.id ?? null;
    const detailQuery = useCrawlJobQuery(detailId);
    const detail = detailQuery.data;
    const chaptersQuery = useCrawlChaptersQuery(detailId, chapterFilter, isActiveCrawlJob(detail));
    const createMutation = useCreateCrawlJobMutation();
    const pauseMutation = useCrawlActionMutation('pause');
    const resumeMutation = useCrawlActionMutation('resume');
    const continueMutation = useCrawlActionMutation('continue');
    const cancelMutation = useCrawlActionMutation('cancel');
    const retryMutation = useCrawlActionMutation('retry');

    useEffect(() => {
        if (novelQuery.data?.url) {
            form.setFieldValue('url', novelQuery.data.url);
        }
    }, [form, novelQuery.data?.url]);

    const submit = (values: FormValues) => {
        createMutation.mutate(
            {
                url: values.url.trim(),
                novelId: lookupQuery.data?.novelId ?? novelId,
                scope: values.scope,
                chapterRange: values.scope === 'chapters' ? values.chapterRange?.trim() : undefined,
            },
            {
                onSuccess: (job) => {
                    message.success('Đã tạo job cào');
                    setSelectedId(job.id);
                },
                onError: (error) => message.error(getErrorMessage(error, 'Không tạo được job')),
            },
        );
    };

    const run = (action: 'pause' | 'resume' | 'continue' | 'cancel' | 'retry', id: number) => {
        const mutation = { pause: pauseMutation, resume: resumeMutation, continue: continueMutation, cancel: cancelMutation, retry: retryMutation }[action];
        mutation.mutate(id, {
            onSuccess: (job) => {
                setSelectedId(job.id);
                message.success('Đã cập nhật job');
            },
            onError: (error) => message.error(getErrorMessage(error, 'Thao tác thất bại')),
        });
    };

    const columns: ColumnsType<CrawlJob> = [
        { title: 'ID', dataIndex: 'id', width: 70 },
        {
            title: 'Truyện',
            render: (_, job) =>
                job.novelId ? (
                    <Link to={`/novels/${job.novelId}`}>{job.novelTitle || job.url}</Link>
                ) : (
                    <Typography.Text ellipsis style={{ maxWidth: 280 }}>
                        {job.url}
                    </Typography.Text>
                ),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 140,
            render: (status: CrawlJobStatus) => <Tag color={statusColor(status)}>{CRAWL_STATUS_LABEL[status]}</Tag>,
        },
        {
            title: 'Tiến độ',
            width: 160,
            render: (_, job) => job.progress.detail,
        },
        {
            title: 'Tạo lúc',
            dataIndex: 'createdAt',
            width: 180,
            render: (value: string) => new Date(value).toLocaleString(),
        },
    ];

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

    const lookup = lookupQuery.data;
    const lookupError = lookupQuery.error ? getErrorMessage(lookupQuery.error, 'URL không hợp lệ') : null;

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
                Crawler
            </Typography.Title>

            <Card size="small" title="Thêm tác vụ cào">
                <Form form={form} layout="vertical" initialValues={{ scope: 'missing' }} onFinish={submit}>
                    <Form.Item name="url" label="URL truyện" rules={[{ required: true, message: 'Nhập URL' }]}>
                        <Input placeholder="https://sangtacviet.com/truyen/..." />
                    </Form.Item>
                    {lookupError ? <Alert type="error" showIcon title={lookupError} style={{ marginBottom: 12 }} /> : null}
                    {lookup ? (
                        <Alert
                            type={lookup.novelId ? 'success' : 'info'}
                            showIcon
                            style={{ marginBottom: 12 }}
                            title={lookup.novelId ? `Đã có trong thư viện: ${lookup.title}` : 'Truyện mới — worker sẽ tạo sau khi đọc được tên'}
                            description={lookup.novelId ? `${lookup.missing} chương chưa có nội dung, ${lookup.failed} chương lỗi, ${lookup.total} chương trong DB` : undefined}
                        />
                    ) : null}
                    <Form.Item name="scope" label="Phạm vi chương">
                        <Radio.Group>
                            <Space orientation="vertical">
                                <Radio value="missing">Cào chương chưa có nội dung</Radio>
                                <Radio value="chapters">Cào theo khoảng chương</Radio>
                                <Radio value="failed" disabled={!lookup?.failed}>
                                    Cào lại chương lỗi ({lookup?.failed ?? 0})
                                </Radio>
                            </Space>
                        </Radio.Group>
                    </Form.Item>
                    {scope === 'chapters' ? (
                        <Form.Item
                            name="chapterRange"
                            label="Phạm vi"
                            extra="Cùng format console: 10 (chương 1–10), 5-10, 1,2,5, all"
                            rules={[{ required: true, message: 'Nhập phạm vi' }]}
                        >
                            <Input placeholder="1-20" />
                        </Form.Item>
                    ) : null}
                    <Button type="primary" htmlType="submit" loading={createMutation.isPending} disabled={!!active}>
                        Tạo tác vụ cào
                    </Button>
                    {active ? (
                        <Typography.Text type="secondary" style={{ marginLeft: 12 }}>
                            Đang có job #{active.id}. Hủy job đó trước khi tạo mới.
                        </Typography.Text>
                    ) : null}
                </Form>
            </Card>

            {detail ? (
                <Card
                    size="small"
                    title={`Tiến độ job #${detail.id}`}
                    extra={<Tag color={statusColor(detail.status)}>{CRAWL_STATUS_LABEL[detail.status]}</Tag>}
                >
                    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                        <div>
                            {detail.novelId ? <Link to={`/novels/${detail.novelId}`}>{detail.novelTitle || detail.url}</Link> : detail.url}
                            <Typography.Text type="secondary"> — {detail.progress.detail}</Typography.Text>
                        </div>
                        <Progress percent={detail.progress.percent ?? 0} status={detail.progress.percent == null ? 'active' : undefined} />
                        <Space size={24} wrap>
                            <span>Hoàn thành: {detail.progress.completed}</span>
                            <span>Bỏ qua: {detail.progress.skipped}</span>
                            <span>Thất bại: {detail.progress.failed}</span>
                            <span>Còn lại: {detail.progress.pending}</span>
                            <span>Thời gian: {elapsed(detail.startedAt, detail.finishedAt)}</span>
                        </Space>
                        {detail.status === 'waiting_for_manual_action' ? (
                            <Alert
                                type="warning"
                                showIcon
                                title="Cần thao tác trên Chrome do worker mở"
                                description={detail.errorMessage || 'Giải captcha nếu có, đợi trang load, rồi bấm Tiếp tục.'}
                            />
                        ) : null}
                        {detail.errorMessage && detail.status !== 'waiting_for_manual_action' ? (
                            <Alert type="error" showIcon title={detail.errorMessage} />
                        ) : null}
                        <Space wrap>
                            {detail.status === 'running' ? (
                                <Button onClick={() => run('pause', detail.id)} loading={pauseMutation.isPending}>
                                    Tạm dừng
                                </Button>
                            ) : null}
                            {detail.status === 'paused' ? (
                                <Button onClick={() => run('resume', detail.id)} loading={resumeMutation.isPending}>
                                    Tiếp tục
                                </Button>
                            ) : null}
                            {detail.status === 'waiting_for_manual_action' ? (
                                <Button type="primary" onClick={() => run('continue', detail.id)} loading={continueMutation.isPending}>
                                    Đã xử lý, tiếp tục
                                </Button>
                            ) : null}
                            {isActiveCrawlJob(detail) ? (
                                <Button danger onClick={() => run('cancel', detail.id)} loading={cancelMutation.isPending}>
                                    Hủy tác vụ
                                </Button>
                            ) : null}
                            {detail.progress.failed > 0 ? (
                                <Button onClick={() => run('retry', detail.id)} loading={retryMutation.isPending} disabled={!!active}>
                                    Cào lại chương lỗi
                                </Button>
                            ) : null}
                        </Space>
                        <Radio.Group
                            value={chapterFilter}
                            onChange={(event) => setChapterFilter(event.target.value)}
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
                            dataSource={chaptersQuery.data ?? []}
                            pagination={{ pageSize: 20, showSizeChanger: false }}
                            locale={{ emptyText: detail.progress.total === 0 ? 'Worker đang lấy danh sách chương' : 'Chưa có dòng chương' }}
                        />
                    </Space>
                </Card>
            ) : null}

            <Card size="small" title="Lịch sử cào">
                <Space wrap style={{ marginBottom: 12 }}>
                    {STATUS_FILTERS.map((item) => (
                        <Button
                            key={item.label}
                            size="small"
                            type={statusFilter === item.value ? 'primary' : 'default'}
                            onClick={() => {
                                setStatusFilter(item.value);
                                setPage(1);
                            }}
                        >
                            {item.label}
                        </Button>
                    ))}
                </Space>
                <Table
                    rowKey="id"
                    size="small"
                    columns={columns}
                    dataSource={jobsQuery.data?.items ?? []}
                    loading={jobsQuery.isLoading}
                    pagination={{
                        current: page,
                        pageSize: 20,
                        total: jobsQuery.data?.total ?? 0,
                        onChange: setPage,
                        showSizeChanger: false,
                    }}
                    onRow={(job) => ({
                        onClick: () => setSelectedId(job.id),
                        style: { cursor: 'pointer' },
                    })}
                />
            </Card>
        </Space>
    );
}
