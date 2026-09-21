import { useMemo, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Modal, Progress, Space, Spin, Table, Typography, message } from 'antd';
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

function percent(done: number, total: number): number {
    if (total <= 0) {
        return 0;
    }
    return Math.round((done / total) * 100);
}

export function DashboardPage() {
    const navigate = useNavigate();
    const { data, isLoading, isError, error } = useNovelsQuery();
    const createMutation = useCreateNovelMutation();
    const updateMutation = useUpdateNovelMutation();
    const deleteMutation = useDeleteNovelMutation();
    const [search, setSearch] = useState('');
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<NovelListItem | null>(null);

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
            onSuccess: () => {
                message.success('Đã thêm truyện');
                closeForm();
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
            render: (_text, _record, index) => index + 1,
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
            width: 140,
            render: (_, novel) => (
                <Progress
                    percent={percent(novel.stats.crawled, novel.stats.total)}
                    size="small"
                    status={novel.stats.crawlFailed > 0 ? 'exception' : undefined}
                    format={(p) => `${p}%`}
                />
            ),
        },
        {
            title: 'TTS',
            key: 'tts',
            width: 140,
            render: (_, novel) => (
                <Progress
                    percent={percent(novel.stats.ttsDone, novel.stats.total)}
                    size="small"
                    status={novel.stats.ttsFailed > 0 ? 'exception' : undefined}
                    format={(p) => `${p}%`}
                />
            ),
        },
        {
            title: 'Lỗi',
            key: 'failed',
            width: 100,
            align: 'right',
            render: (_, novel) => {
                const total = novel.stats.crawlFailed + novel.stats.ttsFailed;
                return total > 0 ? (
                    <Typography.Text type="danger">
                        {novel.stats.crawlFailed}/{novel.stats.ttsFailed}
                    </Typography.Text>
                ) : (
                    <Typography.Text type="secondary">0</Typography.Text>
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
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        aria-label="Sửa truyện"
                        onClick={() => openEdit(novel)}
                    />
                    <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label="Xóa truyện"
                        onClick={() => handleDelete(novel)}
                    />
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
                            onChange={(e) => setSearch(e.target.value)}
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
                    <Table<NovelListItem>
                        rowKey="id"
                        size="small"
                        columns={columns}
                        dataSource={filtered}
                        pagination={
                            filtered.length > 20
                                ? { pageSize: 20, showSizeChanger: false, showTotal: (total) => `${total} truyện` }
                                : false
                        }
                        locale={{ emptyText: <Empty description="Không có truyện khớp tìm kiếm." /> }}
                        onRow={(novel) => ({
                            style: { cursor: 'pointer' },
                            onClick: () => navigate(`/novels/${novel.id}`),
                        })}
                        scroll={{ x: 820 }}
                    />
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
