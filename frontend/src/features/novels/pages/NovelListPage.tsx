import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Modal, Select, Space, Spin, Table, Tooltip, Typography, message, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined, SyncOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useNovelsQuery } from '@/features/novels/hooks/useNovelsQuery.ts';
import {
    useCreateNovelMutation,
    useDeleteNovelMutation,
    useSyncNovelChaptersMutation,
    useUpdateNovelMutation,
} from '@/features/novels/hooks/useNovelMutations.ts';
import { NovelFormModal, type NovelFormValues } from '@/features/novels/components/NovelFormModal.tsx';
import type { NovelListItem } from '@/features/novels/api/novelsApi.ts';
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

function parseSortKey(value: string | null): SortKey {
    const match = SORT_OPTIONS.find((option) => option.value === value);
    return match ? match.value : 'activity-desc';
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
    const [syncingId, setSyncingId] = useState<number | null>(null);
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<SortKey>(() => parseSortKey(searchParams.get('sort')));
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
        if (!q) {
            return data;
        }
        return data.filter(
            (novel) =>
                novel.title.toLowerCase().includes(q) || (novel.author ?? '').toLowerCase().includes(q),
        );
    }, [data, search]);

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
        if (value === 'newest') {
            next.delete('sort');
        } else {
            next.set('sort', value);
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

    const columns: ColumnsType<NovelListItem> = [
        {
            title: '#',
            key: 'STT',
            width: 60,
            align: 'right',
            render: (_text, _record, index) => (currentPage - 1) * pageSize + index + 1,
        },
        {
            title: 'Truyện',
            dataIndex: 'title',
            ellipsis: true,
            render: (title: string) => <Typography.Text strong>{title}</Typography.Text>,
        },
        {
            title: 'Tác giả',
            dataIndex: 'author',
            width: 160,
            ellipsis: true,
            render: (author: string | null) => author || '—',
        },
        {
            title: 'Hoạt động',
            dataIndex: 'lastActivityAt',
            width: 110,
            render: (value: string) => (
                <Tooltip title={formatDateTime(value)}>
                    <span>{formatRelativeTime(value)}</span>
                </Tooltip>
            ),
        },
        {
            title: 'Chương',
            dataIndex: ['stats', 'total'],
            width: 88,
            align: 'right',
        },
        {
            title: 'Crawl',
            key: 'crawl',
            width: 110,
            render: (_, novel) => {
                const s = novel.stats;
                const { color, label, running } = statusOf(s.crawled, s.crawlFailed, s.total, token.colorPrimary);
                return (
                    <Tooltip title={`${label}: ${s.crawled}/${s.total} chương đã crawl`}>
                        <span className="status-count">
                            <span
                                className={running ? 'status-dot status-dot--running' : 'status-dot'}
                                style={{ background: color }}
                            />
                            <span>{s.crawled}/{s.total}</span>
                        </span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'TTS',
            key: 'tts',
            width: 110,
            render: (_, novel) => {
                const s = novel.stats;
                const { color, label, running } = statusOf(s.ttsDone, s.ttsFailed, s.total, token.colorPrimary);
                return (
                    <Tooltip title={`${label}: ${s.ttsDone}/${s.total} chương đã TTS`}>
                        <span className="status-count">
                            <span
                                className={running ? 'status-dot status-dot--running' : 'status-dot'}
                                style={{ background: color }}
                            />
                            <span>{s.ttsDone}/{s.total}</span>
                        </span>
                    </Tooltip>
                );
            },
        },
        {
            title: '',
            key: 'actions',
            width: 132,
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

    if (isLoading) {
        return (
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <Typography.Title level={4} style={{ margin: 0 }}>
                    Danh sách truyện
                </Typography.Title>
                <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
                    <Spin size="large" />
                </div>
            </Space>
        );
    }

    if (isError) {
        return (
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <Typography.Title level={4} style={{ margin: 0 }}>
                    Danh sách truyện
                </Typography.Title>
                <Alert type="error" showIcon title="Không tải được danh sách truyện" description={getErrorMessage(error)} />
            </Space>
        );
    }

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
                Danh sách truyện
            </Typography.Title>

            <Card
                size="small"
                title="Thư viện"
                extra={
                    <Space wrap>
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
                    </Space>
                }
            >
                {!data?.length ? (
                    <Empty description="Chưa có truyện.">
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                            Thêm truyện
                        </Button>
                    </Empty>
                ) : (
                    <div ref={areaRef}>
                        <Table<NovelListItem>
                            rowKey="id"
                            size="small"
                            columns={columns}
                            dataSource={pageRows}
                            rowSelection={{
                                selectedRowKeys: selectedNovelIds,
                                preserveSelectedRowKeys: true,
                                onChange: (keys) => setSelectedNovelIds(keys.map(Number)),
                            }}
                            pagination={false}
                            locale={{ emptyText: <Empty description="Không có truyện khớp tìm kiếm." /> }}
                            onRow={(novel) => ({
                                style: { cursor: 'pointer' },
                                onClick: (event) => {
                                    if (isRowActionTarget(event.target)) {
                                        return;
                                    }
                                    navigate(`/novels/${novel.id}`);
                                },
                            })}
                            scroll={fitTableScroll(700, bodyHeight)}
                        />
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
                    </div>
                )}
            </Card>

            <NovelFormModal
                open={formOpen}
                novel={editing}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                onCancel={closeForm}
                onSubmit={handleSubmit}
            />
        </Space>
    );
}
