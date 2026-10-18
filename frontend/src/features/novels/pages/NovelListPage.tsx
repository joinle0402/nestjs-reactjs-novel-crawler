import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Image, Input, Modal, Progress, Select, Space, Table, Tooltip, Typography, message, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, LinkOutlined, PlusOutlined, SyncOutlined } from '@ant-design/icons';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useNovelsQuery } from '@/features/novels/hooks/useNovelsQuery.ts';
import {
    useBulkDeleteNovelsMutation,
    useBulkSyncNovelsMutation,
    useCreateNovelMutation,
    useDeleteNovelMutation,
    useSyncNovelChaptersMutation,
    useUpdateNovelMutation,
} from '@/features/novels/hooks/useNovelMutations.ts';
import { NovelFormDrawer, type NovelFormValues } from '@/features/novels/components/NovelFormDrawer.tsx';
import type { NovelListItem } from '@/features/novels/api/novelsApi.ts';
import { DEFAULT_NOVEL_COVER, getNovelCoverUrl } from '@/features/novels/lib/novelCover.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';
import { ListPagination } from '@/shared/ui/ListPagination.tsx';
import { DEFAULT_PAGE_LIMIT, isRowActionTarget } from '@/shared/ui/listPagination.ts';
import { fitTableScroll, useTableScrollFit } from '@/shared/ui/useTableScrollFit.ts';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/relativeTime.ts';
import { statusOf } from '@/features/novels/lib/novelStatus.ts';

const SORT_OPTIONS = [
    { value: 'newest', label: 'Mới thêm' },
    { value: 'activity-desc', label: 'Hoạt động gần nhất' },
    { value: 'title-asc', label: 'Tên A→Z' },
    { value: 'title-desc', label: 'Tên Z→A' },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]['value'];

const STATUS_FILTERS = [
    { value: 'all', label: 'Tất cả trạng thái' },
    { value: 'open', label: 'Chưa xong' },
    { value: 'failed', label: 'Có lỗi' },
    { value: 'done', label: 'Hoàn tất' },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]['value'];

function parseSortKey(value: string | null): SortKey {
    const match = SORT_OPTIONS.find((option) => option.value === value);
    return match ? match.value : 'activity-desc';
}

function parseStatusFilter(value: string | null): StatusFilter {
    const match = STATUS_FILTERS.find((option) => option.value === value);
    return match ? match.value : 'all';
}

function matchesStatus(novel: NovelListItem, filter: StatusFilter): boolean {
    if (filter === 'all') {
        return true;
    }
    const stats = novel.stats;
    const hasFailed = stats.crawlFailed > 0 || stats.ttsFailed > 0;
    const isDone = stats.total > 0 && stats.crawled >= stats.total && stats.ttsDone >= stats.total;
    if (filter === 'failed') {
        return hasFailed;
    }
    if (filter === 'done') {
        return isDone && !hasFailed;
    }
    return !isDone || hasFailed;
}

function hostOf(url: string): string {
    try {
        return new URL(url).host.replace(/^www\./, '');
    } catch {
        return '';
    }
}

function ProgressCell({
    done,
    failed,
    total,
    runningColor,
}: {
    done: number;
    failed: number;
    total: number;
    runningColor: string;
}) {
    const { color, label, running } = statusOf(done, failed, total, runningColor);
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const failText = failed > 0 ? ` · ${failed} lỗi` : '';
    return (
        <Tooltip title={`${label}: ${done}/${total} chương${failText}`}>
            <div className="novel-progress">
                <div className="novel-progress__head">
                    <span className={running ? 'status-dot status-dot--running' : 'status-dot'} style={{ background: color }} />
                    <span className="novel-progress__value">
                        {done}
                        <span className="novel-progress__total">/{total}</span>
                    </span>
                    {total > 0 ? <span className="novel-progress__pct">({pct}%)</span> : null}
                    {failed > 0 ? <span className="novel-progress__failed">{failed} lỗi</span> : null}
                </div>
                <Progress percent={pct} size="small" showInfo={false} status={failed > 0 ? 'exception' : undefined} />
            </div>
        </Tooltip>
    );
}

export function NovelListPage() {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { data, isLoading, isError, error } = useNovelsQuery();
    const createMutation = useCreateNovelMutation();
    const updateMutation = useUpdateNovelMutation();
    const deleteMutation = useDeleteNovelMutation();
    const syncMutation = useSyncNovelChaptersMutation();
    const bulkDeleteMutation = useBulkDeleteNovelsMutation();
    const bulkSyncMutation = useBulkSyncNovelsMutation();
    const [syncingId, setSyncingId] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<SortKey>(() => parseSortKey(searchParams.get('sort')));
    const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => parseStatusFilter(searchParams.get('status')));
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<NovelListItem | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_LIMIT);
    const [selectedNovelIds, setSelectedNovelIds] = useState<number[]>([]);
    const { areaRef, bodyHeight } = useTableScrollFit();

    useEffect(() => {
        if (searchParams.get('create') !== '1') {
            return;
        }
        setEditing(null);
        setFormOpen(true);
        const next = new URLSearchParams(searchParams);
        next.delete('create');
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    const filtered = useMemo(() => {
        if (!data) {
            return [];
        }
        const q = search.trim().toLowerCase();
        return data.filter((novel) => {
            if (!matchesStatus(novel, statusFilter)) {
                return false;
            }
            if (!q) {
                return true;
            }
            return novel.title.toLowerCase().includes(q) || (novel.author ?? '').toLowerCase().includes(q);
        });
    }, [data, search, statusFilter]);

    const sorted = useMemo(() => {
        if (sort === 'newest') {
            return filtered;
        }
        const rows = [...filtered];
        if (sort === 'activity-desc') {
            rows.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime());
        } else if (sort === 'title-asc') {
            rows.sort((a, b) => a.title.localeCompare(b.title, 'vi'));
        } else if (sort === 'title-desc') {
            rows.sort((a, b) => b.title.localeCompare(a.title, 'vi'));
        }
        return rows;
    }, [filtered, sort]);

    const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const pageRows = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return sorted.slice(start, start + pageSize);
    }, [currentPage, sorted, pageSize]);

    const handleSortChange = (value: SortKey) => {
        setSort(value);
        setPage(1);
        const next = new URLSearchParams(searchParams);
        if (value === 'activity-desc') {
            next.delete('sort');
        } else {
            next.set('sort', value);
        }
        setSearchParams(next, { replace: true });
    };

    const handleStatusChange = (value: StatusFilter) => {
        setStatusFilter(value);
        setPage(1);
        const next = new URLSearchParams(searchParams);
        if (value === 'all') {
            next.delete('status');
        } else {
            next.set('status', value);
        }
        setSearchParams(next, { replace: true });
    };

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const openEdit = (novel: NovelListItem) => {
        setEditing(novel);
        setFormOpen(true);
    };

    const closeForm = () => {
        setFormOpen(false);
        setEditing(null);
    };

    const handleSubmit = (values: NovelFormValues) => {
        const chapterRange = values.chapterRange?.trim();
        const body = {
            url: values.url.trim(),
            title: values.title.trim(),
            author: values.author?.trim() || undefined,
            summary: values.summary?.trim() || undefined,
        };

        if (editing) {
            updateMutation.mutate(
                { id: editing.id, body },
                {
                    onSuccess: () => {
                        message.success('Đã cập nhật truyện');
                        closeForm();
                    },
                    onError: (err) => message.error(getErrorMessage(err, 'Cập nhật truyện thất bại')),
                },
            );
            return;
        }

        createMutation.mutate(body, {
            onSuccess: (novel) => {
                message.success(chapterRange ? 'Đã thêm truyện. Mở tác vụ cào.' : 'Đã thêm truyện');
                closeForm();
                if (chapterRange) {
                    navigate(`/crawl?novelId=${novel.id}&chapterRange=${encodeURIComponent(chapterRange)}`);
                }
            },
            onError: (err) => message.error(getErrorMessage(err, 'Thêm truyện thất bại')),
        });
    };

    const handleDelete = (novel: NovelListItem) => {
        Modal.confirm({
            title: 'Xóa truyện?',
            content: `Xóa "${novel.title}" và toàn bộ chương liên quan. Không thể hoàn tác.`,
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: () =>
                deleteMutation.mutateAsync(novel.id).then(
                    () => {
                        message.success('Đã xóa truyện');
                    },
                    (err) => {
                        message.error(getErrorMessage(err, 'Xóa truyện thất bại'));
                        return Promise.reject(err);
                    },
                ),
        });
    };

    const handleSync = (novel: NovelListItem) => {
        setSyncingId(novel.id);
        syncMutation.mutate(novel.id, {
            onSuccess: (result) => {
                if (result.synced > 0) {
                    message.success(
                        `Đã đồng bộ ${result.synced} chương mới (tổng ${result.total} chương miễn phí)`,
                    );
                } else {
                    message.info(`Không có chương mới. Tổng ${result.total} chương miễn phí`);
                }
            },
            onError: (err) => message.error(getErrorMessage(err, 'Đồng bộ chương thất bại')),
            onSettled: () => setSyncingId(null),
        });
    };

    const clearSelection = () => setSelectedNovelIds([]);

    const handleBulkSync = () => {
        const ids = [...selectedNovelIds];
        bulkSyncMutation.mutate(ids, {
            onSuccess: (result) => {
                const ok = result.count - result.failed;
                if (result.failed > 0) {
                    message.warning(`Đồng bộ ${ok}/${result.count} truyện (${result.synced} chương mới), ${result.failed} lỗi`);
                    return;
                }
                if (result.synced > 0) {
                    message.success(`Đã đồng bộ ${result.synced} chương mới từ ${result.count} truyện`);
                } else {
                    message.info(`Không có chương mới ở ${result.count} truyện`);
                }
            },
            onError: (err) => message.error(getErrorMessage(err, 'Đồng bộ chương thất bại')),
        });
    };

    const handleBulkDelete = () => {
        const ids = [...selectedNovelIds];
        Modal.confirm({
            title: `Xóa ${ids.length} truyện?`,
            content: 'Toàn bộ chương liên quan cũng bị xóa. Không thể hoàn tác.',
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: () =>
                bulkDeleteMutation.mutateAsync(ids).then(
                    (result) => {
                        clearSelection();
                        if (result.failed > 0) {
                            message.warning(`Đã xóa ${result.succeeded}/${result.total} truyện, ${result.failed} lỗi`);
                        } else {
                            message.success(`Đã xóa ${result.succeeded} truyện`);
                        }
                    },
                    (err) => {
                        message.error(getErrorMessage(err, 'Xóa truyện thất bại'));
                        return Promise.reject(err);
                    },
                ),
        });
    };

    const columns: ColumnsType<NovelListItem> = [
        {
            title: '#',
            key: 'STT',
            width: 56,
            align: 'right',
            render: (_text, _record, index) => (currentPage - 1) * pageSize + index + 1,
        },
        {
            title: 'Ảnh',
            key: 'cover',
            width: 72,
            render: (_, novel) => (
                <span className="novel-cover-cell" onClick={(event) => event.stopPropagation()}>
                    <Image
                        src={getNovelCoverUrl(novel)}
                        alt={novel.title}
                        className="novel-cover"
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
            dataIndex: 'title',
            ellipsis: true,
            render: (title: string, novel) => {
                const meta = [novel.author, hostOf(novel.url)].filter(Boolean).join(' · ');
                return (
                    <div className="novel-cell">
                        <Link className="novel-cell__title" to={`/novels/${novel.id}`}>
                            {title}
                        </Link>
                        <span className="novel-cell__meta">{meta || 'Chưa có tác giả'}</span>
                    </div>
                );
            },
        },
        {
            title: 'Crawl',
            key: 'crawl',
            width: 150,
            render: (_, novel) => (
                <ProgressCell
                    done={novel.stats.crawled}
                    failed={novel.stats.crawlFailed}
                    total={novel.stats.total}
                    runningColor={token.colorPrimary}
                />
            ),
        },
        {
            title: 'TTS',
            key: 'tts',
            width: 150,
            render: (_, novel) => (
                <ProgressCell
                    done={novel.stats.ttsDone}
                    failed={novel.stats.ttsFailed}
                    total={novel.stats.total}
                    runningColor={token.colorPrimary}
                />
            ),
        },
        {
            title: 'Hoạt động',
            dataIndex: 'lastActivityAt',
            width: 116,
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
            render: (_, novel) => (
                <Space size={0} onClick={(event) => event.stopPropagation()}>
                    <Tooltip title="Đồng bộ danh sách chương">
                        <Button
                            type="text"
                            size="small"
                            icon={<SyncOutlined />}
                            loading={syncingId === novel.id}
                            disabled={syncingId !== null && syncingId !== novel.id}
                            aria-label="Đồng bộ chương"
                            onClick={() => handleSync(novel)}
                        />
                    </Tooltip>
                    <Tooltip title="Mở trang nguồn">
                        <Button
                            type="text"
                            size="small"
                            icon={<LinkOutlined />}
                            href={novel.url}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Mở trang nguồn"
                        />
                    </Tooltip>
                    <Tooltip title="Sửa">
                        <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            aria-label="Sửa truyện"
                            onClick={() => openEdit(novel)}
                        />
                    </Tooltip>
                    <Tooltip title="Xóa">
                        <Button
                            type="text"
                            size="small"
                            className="row-action-delete"
                            icon={<DeleteOutlined />}
                            aria-label="Xóa truyện"
                            onClick={() => handleDelete(novel)}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const filteredActive = search.trim().length > 0 || statusFilter !== 'all';

    const emptyNode = filteredActive ? (
        <Empty description="Không có truyện khớp bộ lọc.">
            <Button
                onClick={() => {
                    setSearch('');
                    handleStatusChange('all');
                }}
            >
                Xóa bộ lọc
            </Button>
        </Empty>
    ) : (
        <Empty description="Chưa có truyện.">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Thêm truyện
            </Button>
        </Empty>
    );

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Card
                size="small"
                title="Danh sách truyện"
                extra={
                    <Space wrap>
                        {selectedNovelIds.length > 0 ? (
                            <>
                                <Typography.Text type="secondary">
                                    Đã chọn <strong>{selectedNovelIds.length}</strong> truyện
                                </Typography.Text>
                                <Button
                                    icon={<SyncOutlined />}
                                    loading={bulkSyncMutation.isPending}
                                    onClick={handleBulkSync}
                                >
                                    Đồng bộ chương
                                </Button>
                                <Button
                                    danger
                                    icon={<DeleteOutlined />}
                                    loading={bulkDeleteMutation.isPending}
                                    onClick={handleBulkDelete}
                                >
                                    Xóa
                                </Button>
                                <Button type="text" onClick={clearSelection}>
                                    Bỏ chọn
                                </Button>
                            </>
                        ) : (
                            <>
                                <Input.Search
                                    allowClear
                                    placeholder="Tìm theo tên / tác giả"
                                    value={search}
                                    onChange={(e) => {
                                        setSearch(e.target.value);
                                        setPage(1);
                                    }}
                                    style={{ width: 240 }}
                                />
                                <Select<StatusFilter>
                                    value={statusFilter}
                                    onChange={handleStatusChange}
                                    options={STATUS_FILTERS.map((option) => ({ value: option.value, label: option.label }))}
                                    style={{ width: 160 }}
                                    aria-label="Lọc theo trạng thái"
                                />
                                <Select<SortKey>
                                    value={sort}
                                    onChange={handleSortChange}
                                    options={SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                                    style={{ width: 180 }}
                                    aria-label="Sắp xếp danh sách truyện"
                                />
                                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                                    Thêm truyện
                                </Button>
                            </>
                        )}
                    </Space>
                }
            >
                {isError ? (
                    <Alert
                        type="error"
                        showIcon
                        title="Không tải được danh sách truyện"
                        description={getErrorMessage(error)}
                    />
                ) : (
                    <div ref={areaRef}>
                        <Table<NovelListItem>
                            rowKey="id"
                            size="small"
                            columns={columns}
                            dataSource={pageRows}
                            loading={isLoading}
                            rowSelection={{
                                selectedRowKeys: selectedNovelIds,
                                preserveSelectedRowKeys: true,
                                onChange: (keys) => setSelectedNovelIds(keys.map(Number)),
                            }}
                            pagination={false}
                            locale={{ emptyText: emptyNode }}
                            onRow={(novel) => ({
                                style: { cursor: 'pointer' },
                                onClick: (event) => {
                                    if (isRowActionTarget(event.target)) {
                                        return;
                                    }
                                    setSelectedNovelIds((current) =>
                                        current.includes(novel.id)
                                            ? current.filter((id) => id !== novel.id)
                                            : [...current, novel.id],
                                    );
                                },
                            })}
                            scroll={fitTableScroll(940, bodyHeight)}
                        />
                        {!isLoading && data?.length ? (
                            <ListPagination
                                current={currentPage}
                                pageSize={pageSize}
                                total={sorted.length}
                                totalLabel={(total) => `${total} truyện`}
                                onChange={(nextPage, nextSize) => {
                                    if (nextSize !== pageSize) {
                                        setPageSize(nextSize);
                                        setPage(1);
                                        return;
                                    }
                                    setPage(nextPage);
                                }}
                            />
                        ) : null}
                    </div>
                )}
            </Card>

            <NovelFormDrawer
                open={formOpen}
                novel={editing}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                onCancel={closeForm}
                onSubmit={handleSubmit}
            />
        </Space>
    );
}
