import { Button, Card, Empty, Image, Modal, Progress, Space, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    CaretRightOutlined,
    CopyOutlined,
    DeleteOutlined,
    EditOutlined,
    EyeOutlined,
    PauseOutlined,
    PlusOutlined,
    SyncOutlined,
} from '@ant-design/icons';
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
import { DEFAULT_NOVEL_COVER, getNovelCoverUrl } from '@/features/novels/lib/novelCover.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';
import { parseRouteId } from '@/shared/lib/parseRouteId.ts';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/relativeTime.ts';
import { ListPagination } from '@/shared/ui/ListPagination.tsx';
import { DEFAULT_PAGE_LIMIT, isRowActionTarget } from '@/shared/ui/listPagination.ts';
import { fitTableScroll, useTableScrollFit } from '@/shared/ui/useTableScrollFit.ts';

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

const SCOPE_LABEL: Record<CrawlScope, string> = {
    missing: 'Chương còn thiếu',
    failed: 'Chương lỗi',
    chapters: 'Khoảng chương',
    refresh: 'Cập nhật chương mới',
};

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

function hostOf(url: string): string {
    try {
        return new URL(url).host.replace(/^www\./, '');
    } catch {
        return '';
    }
}

function jobMeta(job: CrawlJob): string {
    const scope = job.scope === 'chapters' && job.chapterRange ? `Chương ${job.chapterRange}` : SCOPE_LABEL[job.scope];
    return [scope, hostOf(job.url)].filter(Boolean).join(' · ');
}

function jobCoverSrc(job: CrawlJob): string {
    return job.novelId ? getNovelCoverUrl({ id: job.novelId, coverImage: job.novelCoverImage }) : DEFAULT_NOVEL_COVER;
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

function CrawlProgressCell({ job }: { job: CrawlJob }) {
    const { completed, failed, skipped, total, percent, detail } = job.progress;
    const running = job.status === 'running';

    if (total === 0) {
        return (
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                {isActiveCrawlJob(job) ? detail || 'Đang chuẩn bị…' : '—'}
            </Typography.Text>
        );
    }

    const pct = percent ?? Math.round((completed / total) * 100);
    return (
        <Tooltip title={detail}>
            <div className="novel-progress">
                <div className="novel-progress__head">
                    <span className="novel-progress__value">
                        {completed}
                        <span className="novel-progress__total">/{total}</span>
                    </span>
                    <span className="novel-progress__pct">({pct}%)</span>
                    {skipped > 0 ? <span className="novel-progress__pct">{skipped} bỏ qua</span> : null}
                    {failed > 0 ? <span className="novel-progress__failed">{failed} lỗi</span> : null}
                </div>
                <Progress
                    percent={pct}
                    size="small"
                    showInfo={false}
                    status={failed > 0 ? 'exception' : running ? 'active' : undefined}
                />
            </div>
        </Tooltip>
    );
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
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_LIMIT);
    const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
    const [chapterFilter, setChapterFilter] = useState<CrawlChapterStatus | ''>('');
    const { areaRef, bodyHeight } = useTableScrollFit();
    const jobsQuery = useCrawlJobsQuery(statusFilter, page, pageSize);
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

    const openCreate = () => {
        setDraft({
            mode: 'create',
            novelId: novelQuery.data?.id,
            url: novelQuery.data?.url ?? '',
            scope: 'chapters',
            chapterRange: '',
        });
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

    const confirmBulkDelete = () => {
        const ids = [...selectedJobIds];
        Modal.confirm({
            title: `Xóa ${ids.length} tác vụ?`,
            content: 'Chỉ xóa lịch sử task. Nội dung chương đã cào vẫn giữ. Tác vụ đang hoạt động sẽ không xóa được.',
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: async () => {
                const results = await Promise.allSettled(ids.map((id) => deleteMutation.mutateAsync(id)));
                const ok = results.filter((result) => result.status === 'fulfilled').length;
                const failed = results.length - ok;
                setSelectedJobIds([]);
                if (failed > 0) {
                    message.warning(`Đã xóa ${ok}/${results.length} tác vụ, ${failed} lỗi`);
                } else {
                    message.success(`Đã xóa ${ok} tác vụ`);
                }
            },
        });
    };

    const columns: ColumnsType<CrawlJob> = [
        { title: 'ID', dataIndex: 'id', width: 64 },
        {
            title: 'Ảnh',
            key: 'cover',
            width: 72,
            render: (_, job) => (
                <span className="novel-cover-cell" onClick={(event) => event.stopPropagation()}>
                    <Image
                        src={jobCoverSrc(job)}
                        alt={job.novelTitle || job.url}
                        width={44}
                        height={60}
                        fallback={DEFAULT_NOVEL_COVER}
                        preview={{ mask: 'Xem ảnh' }}
                    />
                </span>
            ),
        },
        {
            title: 'Truyện',
            key: 'novel',
            ellipsis: true,
            render: (_, job) => (
                <div className="novel-cell">
                    <Link className="novel-cell__title" to={job.novelId ? `/novels/${job.novelId}` : '/crawl'}>
                        {job.novelTitle || job.url}
                    </Link>
                    <span className="novel-cell__meta">{jobMeta(job)}</span>
                </div>
            ),
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            width: 150,
            render: (status: CrawlJobStatus, job) => {
                const tag = (
                    <Tag icon={status === 'running' ? <SyncOutlined spin /> : undefined} color={statusColor(status)}>
                        {CRAWL_STATUS_LABEL[status]}
                    </Tag>
                );
                return job.errorMessage ? <Tooltip title={job.errorMessage}>{tag}</Tooltip> : tag;
            },
        },
        {
            title: 'Tiến độ',
            key: 'progress',
            width: 190,
            render: (_, job) => <CrawlProgressCell job={job} />,
        },
        {
            title: 'Tạo lúc',
            dataIndex: 'createdAt',
            width: 120,
            render: (value: string) => (
                <Tooltip title={formatDateTime(value)}>
                    <span className="novel-activity">{formatRelativeTime(value)}</span>
                </Tooltip>
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 168,
            fixed: 'right',
            render: (_, job) => (
                <Space size={0} onClick={(event) => event.stopPropagation()}>
                    {job.status === 'running' ? (
                        <Tooltip title="Tạm dừng">
                            <Button
                                type="text"
                                size="small"
                                icon={<PauseOutlined />}
                                aria-label="Tạm dừng tác vụ"
                                loading={pauseMutation.isPending}
                                onClick={() => run('pause', job.id)}
                            />
                        </Tooltip>
                    ) : null}
                    {job.status === 'paused' || job.status === 'waiting_for_manual_action' ? (
                        <Tooltip title={job.status === 'waiting_for_manual_action' ? 'Đã xử lý, tiếp tục' : 'Tiếp tục'}>
                            <Button
                                type="text"
                                size="small"
                                icon={<CaretRightOutlined />}
                                aria-label="Tiếp tục tác vụ"
                                loading={job.status === 'waiting_for_manual_action' ? continueMutation.isPending : resumeMutation.isPending}
                                onClick={() => run(job.status === 'waiting_for_manual_action' ? 'continue' : 'resume', job.id)}
                            />
                        </Tooltip>
                    ) : null}
                    <Tooltip title="Xem chi tiết">
                        <Button type="text" size="small" icon={<EyeOutlined />} aria-label="Xem chi tiết tác vụ" onClick={() => openDetail(job.id)} />
                    </Tooltip>
                    {canEditCrawlJob(job.status) ? (
                        <Tooltip title="Sửa">
                            <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                aria-label="Sửa tác vụ"
                                onClick={() => setDraft(draftFrom(job, 'edit'))}
                            />
                        </Tooltip>
                    ) : null}
                    <Tooltip title="Nhân bản">
                        <Button
                            type="text"
                            size="small"
                            icon={<CopyOutlined />}
                            aria-label="Nhân bản tác vụ"
                            onClick={() => setDraft(draftFrom(job, 'clone'))}
                        />
                    </Tooltip>
                    <Tooltip title={isActiveCrawlJob(job) ? 'Hủy tác vụ trước khi xóa' : 'Xóa'}>
                        <Button
                            type="text"
                            size="small"
                            className="row-action-delete"
                            icon={<DeleteOutlined />}
                            aria-label="Xóa tác vụ"
                            disabled={isActiveCrawlJob(job)}
                            onClick={() => confirmDelete(job)}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const hasSelection = selectedJobIds.length > 0;
    const filterActive = statusFilter !== '';

    const emptyNode = filterActive ? (
        <Empty description="Không có tác vụ khớp bộ lọc.">
            <Button onClick={() => { setStatusFilter(''); setPage(1); }}>Xóa bộ lọc</Button>
        </Empty>
    ) : (
        <Empty description="Chưa có tác vụ cào.">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Thêm tác vụ
            </Button>
        </Empty>
    );

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Typography.Title level={4} style={{ margin: 0 }}>
                    Crawler
                </Typography.Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    Thêm tác vụ
                </Button>
            </Space>

            <Card size="small" title="Lịch sử cào">
                <Space wrap style={{ marginBottom: 12, justifyContent: 'space-between', width: '100%' }}>
                    <Space wrap>
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
                    {hasSelection ? (
                        <Space>
                            <Typography.Text type="secondary">
                                Đã chọn <strong>{selectedJobIds.length}</strong> tác vụ
                            </Typography.Text>
                            <Button danger icon={<DeleteOutlined />} onClick={confirmBulkDelete}>
                                Xóa
                            </Button>
                            <Button type="text" onClick={() => setSelectedJobIds([])}>
                                Bỏ chọn
                            </Button>
                        </Space>
                    ) : null}
                </Space>
                <div ref={areaRef}>
                    <Table
                        rowKey="id"
                        size="small"
                        columns={columns}
                        dataSource={jobsQuery.data?.items ?? []}
                        loading={jobsQuery.isLoading}
                        rowSelection={{
                            selectedRowKeys: selectedJobIds,
                            preserveSelectedRowKeys: true,
                            onChange: (keys) => setSelectedJobIds(keys.map(Number)),
                        }}
                        pagination={false}
                        locale={{ emptyText: emptyNode }}
                        scroll={fitTableScroll(952, bodyHeight)}
                        onRow={(job) => ({
                            onClick: (event) => {
                                if (isRowActionTarget(event.target)) {
                                    return;
                                }
                                openDetail(job.id);
                            },
                            style: { cursor: 'pointer' },
                        })}
                    />
                    <ListPagination
                        current={page}
                        pageSize={pageSize}
                        total={jobsQuery.data?.total ?? 0}
                        totalLabel={(total) => `${total} tác vụ`}
                        onChange={(nextPage, nextSize) => {
                            if (nextSize !== pageSize) {
                                setPageSize(nextSize);
                                setPage(1);
                                return;
                            }
                            setPage(nextPage);
                        }}
                    />
                </div>
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
