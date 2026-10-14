import { useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Modal, Space, Spin, Table, Tooltip, Typography, message, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useNovelsQuery } from '@/features/novels/hooks/useNovelsQuery.ts';
import {
    useCreateNovelMutation,
    useDeleteNovelMutation,
    useUpdateNovelMutation,
} from '@/features/novels/hooks/useNovelMutations.ts';
import { NovelFormModal, type NovelFormValues } from '@/features/novels/components/NovelFormModal.tsx';
import type { NovelListItem } from '@/features/novels/api/novelsApi.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';
import { ListPagination } from '@/shared/ui/ListPagination.tsx';
import { DEFAULT_PAGE_LIMIT, isRowActionTarget } from '@/shared/ui/listPagination.ts';
import { fitTableScroll, useTableScrollFit } from '@/shared/ui/useTableScrollFit.ts';

function statusOf(
    done: number,
    failed: number,
    total: number,
    runningColor: string,
): { color: string; label: string; running: boolean } {
    if (failed > 0) {
        return { color: '#ff4d4f', label: 'Có lỗi', running: false };
    }
    if (total > 0 && done >= total) {
        return { color: '#52c41a', label: 'Hoàn tất', running: false };
    }
    if (done > 0) {
        return { color: runningColor, label: 'Đang chạy', running: true };
    }
    return { color: '#d9d9d9', label: 'Chưa bắt đầu', running: false };
}

export function DashboardPage() {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const { data, isLoading, isError, error } = useNovelsQuery();
    const createMutation = useCreateNovelMutation();
    const updateMutation = useUpdateNovelMutation();
    const deleteMutation = useDeleteNovelMutation();
    const [search, setSearch] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<NovelListItem | null>(null);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_LIMIT);
    const [selectedNovelIds, setSelectedNovelIds] = useState<number[]>([]);
    const { areaRef, bodyHeight } = useTableScrollFit();

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

    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const pageRows = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [currentPage, filtered, pageSize]);

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
            width: 96,
            fixed: 'right',
            render: (_, novel) => (
                <Space size={0} onClick={(event) => event.stopPropagation()}>
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
            <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
                <Spin size="large" />
            </div>
        );
    }

    if (isError) {
        return <Alert type="error" showIcon title="Không tải được danh sách truyện" description={getErrorMessage(error)} />;
    }

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
                Dashboard
            </Typography.Title>

            <Card
                id="novels-table"
                size="small"
                title="Danh sách truyện"
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
                            total={filtered.length}
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
