import { Button, Card, Modal, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
    CRAWL_STATUS_LABEL,
    canEditCrawlJob,
    isActiveCrawlJob,
    type CrawlChapterStatus,
    type CrawlJob,
    type CrawlJobStatus,
    type CrawlScope,
} from '@/features/crawl/api/crawlApi.ts';
import { CrawlDetailDrawer } from '@/features/crawl/components/CrawlDetailDrawer.tsx';
import { CrawlTaskDrawer, type CrawlTaskDraft } from '@/features/crawl/components/CrawlTaskDrawer.tsx';
import {
    useCrawlActionMutation,
    useCrawlChaptersQuery,
    useCrawlJobQuery,
    useCrawlJobsQuery,
    useCurrentCrawlJobQuery,
    useDeleteCrawlJobMutation,
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

function statusColor(status: CrawlJobStatus): string {
    if (status === 'completed') {
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

function draftFrom(job: CrawlJob, mode: 'edit' | 'clone'): CrawlTaskDraft {
    return {
        mode,
        jobId: mode === 'edit' ? job.id : undefined,
        novelId: job.novelId ?? undefined,
        url: job.url,
        scope: job.scope,
        chapterRange: job.chapterRange ?? (job.scope === 'chapters' ? '' : ''),
    };
}

export function CrawlPage() {
    const [params] = useSearchParams();
    const novelId = parseRouteId(params.get('novelId') ?? undefined);
    const chapterRangeParam = params.get('chapterRange')?.trim() ?? '';
    const jobIdParam = parseRouteId(params.get('jobId') ?? undefined);
    const novelQuery = useNovelQuery(novelId);
    const currentQuery = useCurrentCrawlJobQuery();
    const [selectedId, setSelectedId] = useState<number | null>(jobIdParam ?? null);
    const [detailOpen, setDetailOpen] = useState(jobIdParam != null);
    const [draft, setDraft] = useState<CrawlTaskDraft | null>(null);
    const [statusFilter, setStatusFilter] = useState<CrawlJobStatus | ''>('');
    const [page, setPage] = useState(1);
    const [chapterFilter, setChapterFilter] = useState<CrawlChapterStatus | ''>('');
    const jobsQuery = useCrawlJobsQuery(statusFilter, page);
    const active = currentQuery.data && isActiveCrawlJob(currentQuery.data) ? currentQuery.data : null;
    const detailQuery = useCrawlJobQuery(detailOpen ? selectedId : null);
    const detail = detailOpen ? (detailQuery.data ?? null) : null;
    const chaptersQuery = useCrawlChaptersQuery(detailOpen ? selectedId : null, chapterFilter, isActiveCrawlJob(detail));
    const pauseMutation = useCrawlActionMutation('pause');
    const resumeMutation = useCrawlActionMutation('resume');
    const continueMutation = useCrawlActionMutation('continue');
    const cancelMutation = useCrawlActionMutation('cancel');
    const retryMutation = useCrawlActionMutation('retry');
    const deleteMutation = useDeleteCrawlJobMutation();
    const actionPending = pauseMutation.isPending || resumeMutation.isPending || continueMutation.isPending || cancelMutation.isPending || retryMutation.isPending;

    useEffect(() => {
        if (!jobIdParam) {
            return;
        }
        setSelectedId(jobIdParam);
        setDetailOpen(true);
        setDraft(null);
    }, [jobIdParam]);

    useEffect(() => {
        if (!novelId || jobIdParam || !novelQuery.data?.url) {
            return;
        }
        setDraft({
            mode: 'create',
            novelId,
            url: novelQuery.data.url,
            scope: 'chapters' satisfies CrawlScope,
            chapterRange: chapterRangeParam,
        });
        setDetailOpen(false);
    }, [chapterRangeParam, jobIdParam, novelId, novelQuery.data?.url]);

    const openDetail = (id: number) => {
        setSelectedId(id);
        setDetailOpen(true);
        setChapterFilter('');
        setDraft(null);
    };

    const run = (action: 'pause' | 'resume' | 'continue' | 'cancel' | 'retry', id: number) => {
        const mutation = { pause: pauseMutation, resume: resumeMutation, continue: continueMutation, cancel: cancelMutation, retry: retryMutation }[action];
        mutation.mutate(id, {
            onSuccess: (job) => {
                setSelectedId(job.id);
                setDetailOpen(true);
                message.success(action === 'resume' ? 'Đã tiếp tục task này' : 'Đã cập nhật task');
            },
            onError: (error) => message.error(getErrorMessage(error, 'Thao tác thất bại')),
        });
    };

    const confirmDelete = (job: CrawlJob) => {
        Modal.confirm({
            title: `Xóa task #${job.id}?`,
            content: 'Chỉ xóa lịch sử task. Nội dung chương đã cào vẫn giữ.',
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: () =>
                deleteMutation.mutateAsync(job.id).then(
                    () => {
                        if (selectedId === job.id) {
                            setDetailOpen(false);
                            setSelectedId(null);
                        }
                        message.success('Đã xóa lịch sử cào');
                    },
                    (error) => {
                        message.error(getErrorMessage(error, 'Không xóa được task'));
                        return Promise.reject(error);
                    },
                ),
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
            width: 180,
            render: (_, job) => job.progress.detail,
        },
        {
            title: 'Tạo lúc',
            dataIndex: 'createdAt',
            width: 180,
            render: (value: string) => new Date(value).toLocaleString(),
        },
        {
            title: '',
            key: 'actions',
            width: 180,
            render: (_, job) => (
                <Space size={0} onClick={(event) => event.stopPropagation()}>
                    {canEditCrawlJob(job.status) ? (
                        <Button type="link" size="small" onClick={() => setDraft(draftFrom(job, 'edit'))}>
                            Sửa
                        </Button>
                    ) : null}
                    <Button type="link" size="small" onClick={() => setDraft(draftFrom(job, 'clone'))}>
                        Clone
                    </Button>
                    <Button type="link" size="small" danger disabled={isActiveCrawlJob(job)} onClick={() => confirmDelete(job)}>
                        Xóa
                    </Button>
                </Space>
            ),
        },
    ];

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Typography.Title level={4} style={{ margin: 0 }}>
                    Crawler
                </Typography.Title>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() =>
                        setDraft({
                            mode: 'create',
                            novelId: novelQuery.data?.id,
                            url: novelQuery.data?.url ?? '',
                            scope: 'chapters',
                            chapterRange: '',
                        })
                    }
                >
                    Thêm tác vụ
                </Button>
            </Space>

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
                        onClick: () => openDetail(job.id),
                        style: { cursor: 'pointer' },
                    })}
                />
            </Card>

            <CrawlTaskDrawer
                draft={draft}
                blocked={!!active}
                onClose={() => setDraft(null)}
                onSaved={(jobId) => {
                    setDraft(null);
                    openDetail(jobId);
                }}
            />
            <CrawlDetailDrawer
                job={detail}
                chapters={chaptersQuery.data ?? []}
                chaptersLoading={chaptersQuery.isFetching}
                chapterFilter={chapterFilter}
                activeJobId={active?.id ?? null}
                actionPending={actionPending}
                onChapterFilter={setChapterFilter}
                onClose={() => setDetailOpen(false)}
                onAction={run}
                onEdit={(job) => {
                    setDetailOpen(false);
                    setDraft(draftFrom(job, 'edit'));
                }}
                onClone={(job) => {
                    setDetailOpen(false);
                    setDraft(draftFrom(job, 'clone'));
                }}
                onDelete={confirmDelete}
            />
        </Space>
    );
}
