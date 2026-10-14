import { DeleteOutlined, PauseCircleOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Empty, Input, Modal, Space, Table, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useRef, useState } from 'react';
import { getBgmAudioUrl, type BgmTrack } from '@/features/bgm/api/bgmApi.ts';
import { BgmCreateDrawer } from '@/features/bgm/components/BgmCreateDrawer.tsx';
import { useBgmTracksQuery, useDeleteBgmTrackMutation, useDeleteBgmTracksMutation } from '@/features/bgm/hooks/useBgmQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';
import { ListPagination } from '@/shared/ui/ListPagination.tsx';
import { DEFAULT_PAGE_LIMIT, isRowActionTarget } from '@/shared/ui/listPagination.ts';
import { fitTableScroll, useTableScrollFit } from '@/shared/ui/useTableScrollFit.ts';

export function BgmPage() {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_LIMIT);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const { areaRef, bodyHeight } = useTableScrollFit();
    const tracksQuery = useBgmTracksQuery();
    const deleteMutation = useDeleteBgmTrackMutation();
    const deleteManyMutation = useDeleteBgmTracksMutation();

    const stopPreview = () => {
        const audio = audioRef.current;
        if (audio) {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
        }
        setPlayingId(null);
    };

    const togglePreview = (track: BgmTrack) => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        if (playingId === track.id) {
            stopPreview();
            return;
        }
        audio.src = getBgmAudioUrl(track.id);
        audio.loop = true;
        void audio.play().then(() => setPlayingId(track.id)).catch(() => {
            setPlayingId(null);
            message.error('Không phát được file nhạc nền');
        });
    };

    const filtered = useMemo(() => {
        const tracks = tracksQuery.data ?? [];
        const query = search.trim().toLowerCase();
        if (!query) {
            return tracks;
        }
        return tracks.filter((track) => track.name.toLowerCase().includes(query));
    }, [search, tracksQuery.data]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const pageRows = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return filtered.slice(start, start + pageSize);
    }, [currentPage, filtered, pageSize]);

    const confirmDelete = (track: BgmTrack) => {
        Modal.confirm({
            title: `Xóa "${track.name}"?`,
            content: 'File nhạc nền sẽ bị xóa khỏi thư viện.',
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: () =>
                deleteMutation.mutateAsync(track.id).then(
                    () => {
                        if (playingId === track.id) {
                            stopPreview();
                        }
                        setSelectedIds((current) => current.filter((id) => id !== track.id));
                        message.success('Đã xóa nhạc nền');
                    },
                    (error) => {
                        message.error(getErrorMessage(error, 'Không xóa được'));
                        return Promise.reject(error);
                    },
                ),
        });
    };

    const confirmDeleteMany = () => {
        const ids = selectedIds;
        Modal.confirm({
            title: `Xóa ${ids.length} nhạc nền?`,
            content: 'Các file đã chọn sẽ bị xóa khỏi thư viện.',
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: () =>
                deleteManyMutation.mutateAsync(ids).then(
                    () => {
                        if (playingId && ids.includes(playingId)) {
                            stopPreview();
                        }
                        setSelectedIds([]);
                        message.success('Đã xóa nhạc nền đã chọn');
                    },
                    (error) => {
                        message.error(getErrorMessage(error, 'Không xóa được'));
                        return Promise.reject(error);
                    },
                ),
        });
    };

    const columns: ColumnsType<BgmTrack> = [
        {
            title: '#',
            key: 'stt',
            width: 60,
            align: 'right',
            render: (_value, _track, index) => (currentPage - 1) * pageSize + index + 1,
        },
        {
            title: 'Tên',
            dataIndex: 'name',
            ellipsis: true,
            render: (name: string) => <Typography.Text strong>{name}</Typography.Text>,
        },
        {
            title: 'Ngày thêm',
            dataIndex: 'createdAt',
            width: 180,
            render: (value: string) => (value ? new Date(value).toLocaleString() : '—'),
        },
        {
            title: '',
            key: 'actions',
            width: 96,
            fixed: 'right',
            render: (_, track) => (
                <Space size={0} onClick={(event) => event.stopPropagation()}>
                    <Tooltip title={playingId === track.id ? 'Dừng nghe thử' : 'Nghe thử'}>
                        <Button
                            type="text"
                            size="small"
                            icon={playingId === track.id ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                            aria-label={playingId === track.id ? 'Dừng nghe thử' : 'Nghe thử'}
                            onClick={() => togglePreview(track)}
                        />
                    </Tooltip>
                    <Tooltip title="Xóa">
                        <Button
                            type="text"
                            size="small"
                            className="row-action-delete"
                            icon={<DeleteOutlined />}
                            aria-label={`Xóa ${track.name}`}
                            onClick={() => confirmDelete(track)}
                        />
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Typography.Title level={4} style={{ margin: 0 }}>
                Nhạc nền
            </Typography.Title>

            {tracksQuery.isError ? (
                <Alert type="error" showIcon title="Không tải được danh sách" description={getErrorMessage(tracksQuery.error)} />
            ) : null}

            <Card
                size="small"
                title="Thư viện"
                extra={
                    <Space wrap>
                        {selectedIds.length > 0 ? (
                            <Button danger onClick={confirmDeleteMany} loading={deleteManyMutation.isPending}>
                                Xóa đã chọn ({selectedIds.length})
                            </Button>
                        ) : null}
                        <Input.Search
                            allowClear
                            placeholder="Tìm theo tên"
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            style={{ width: 220 }}
                        />
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>
                            Thêm nhạc nền
                        </Button>
                    </Space>
                }
            >
                {tracksQuery.isError ? null : !tracksQuery.isLoading && filtered.length === 0 ? (
                    <Empty description={search.trim() ? 'Không có nhạc nền khớp tìm kiếm.' : 'Chưa có nhạc nền.'}>
                        {search.trim() ? null : (
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => setDrawerOpen(true)}>
                                Thêm nhạc nền
                            </Button>
                        )}
                    </Empty>
                ) : (
                    <div ref={areaRef}>
                        <Table<BgmTrack>
                            rowKey="id"
                            size="small"
                            columns={columns}
                            dataSource={pageRows}
                            loading={tracksQuery.isLoading}
                            rowSelection={{
                                selectedRowKeys: selectedIds,
                                preserveSelectedRowKeys: true,
                                onChange: (keys) => setSelectedIds(keys.map(String)),
                            }}
                            pagination={false}
                            onRow={(track) => ({
                                onClick: (event) => {
                                    if (isRowActionTarget(event.target)) {
                                        return;
                                    }
                                    setSelectedIds((current) =>
                                        current.includes(track.id) ? current.filter((id) => id !== track.id) : [...current, track.id],
                                    );
                                },
                            })}
                            scroll={fitTableScroll(640, bodyHeight)}
                        />
                        <ListPagination
                            current={currentPage}
                            pageSize={pageSize}
                            total={filtered.length}
                            totalLabel={(total) => `${total} nhạc nền`}
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

            <audio ref={audioRef} preload="none" />
            <BgmCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </Space>
    );
}
