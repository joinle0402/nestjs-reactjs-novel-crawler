import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Empty, Image, Modal, Space, Switch, Table, Tag, Tooltip, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DeleteOutlined, EditOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import {
    formatScheduleDays,
    type Schedule,
    type ScheduleLastStatus,
    type ScheduleRunStage,
} from '@/features/schedules/api/schedulesApi.ts';
import { ScheduleFormDrawer } from '@/features/schedules/components/ScheduleFormDrawer.tsx';
import {
    useDeleteScheduleMutation,
    useRunScheduleNowMutation,
    useSchedulesQuery,
    useUpdateScheduleMutation,
} from '@/features/schedules/hooks/useScheduleQueries.ts';
import { DEFAULT_NOVEL_COVER, getNovelCoverUrl } from '@/features/novels/lib/novelCover.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/relativeTime.ts';
import { ListPagination } from '@/shared/ui/ListPagination.tsx';
import { DEFAULT_PAGE_LIMIT, isRowActionTarget } from '@/shared/ui/listPagination.ts';
import { fitTableScroll, useTableScrollFit } from '@/shared/ui/useTableScrollFit.ts';

const STAGE_LABEL: Record<ScheduleRunStage, string> = {
    idle: 'Chờ',
    sync: 'Đang kiểm tra',
    crawl: 'Đang cào',
    tts: 'Đang TTS',
    drive: 'Đang Drive',
};

const LAST_STATUS_LABEL: Record<ScheduleLastStatus, string> = {
    running: 'Đang chạy',
    completed: 'Xong',
    skipped: 'Bỏ qua',
    failed: 'Lỗi',
};

function lastStatusColor(status: ScheduleLastStatus | null): string {
    if (status === 'completed') {
        return 'success';
    }
    if (status === 'failed') {
        return 'error';
    }
    if (status === 'running') {
        return 'processing';
    }
    return 'default';
}

function hostOf(url: string | null): string {
    if (!url) {
        return '';
    }
    try {
        return new URL(url).host.replace(/^www\./, '');
    } catch {
        return '';
    }
}

function ScheduleStatusCell({ schedule }: { schedule: Schedule }) {
    if (!schedule.lastStatus) {
        return (
            <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                Chưa chạy
            </Typography.Text>
        );
    }
    const label = schedule.lastStatus === 'running' ? STAGE_LABEL[schedule.runStage] : LAST_STATUS_LABEL[schedule.lastStatus];
    const tag = <Tag color={lastStatusColor(schedule.lastStatus)}>{label}</Tag>;
    return (
        <div className="schedule-status">
            {schedule.lastMessage ? <Tooltip title={schedule.lastMessage}>{tag}</Tooltip> : tag}
            {schedule.lastRunAt ? (
                <Tooltip title={formatDateTime(schedule.lastRunAt)}>
                    <span className="novel-cell__meta">{formatRelativeTime(schedule.lastRunAt)}</span>
                </Tooltip>
            ) : null}
            {schedule.lastNewChapters != null && schedule.lastNewChapters > 0 ? (
                <span className="novel-cell__meta">+{schedule.lastNewChapters} chương</span>
            ) : null}
        </div>
    );
}

export function SchedulesPage() {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_LIMIT);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState<Schedule | null>(null);
    const { areaRef, bodyHeight } = useTableScrollFit();
    const schedulesQuery = useSchedulesQuery();
    const updateMutation = useUpdateScheduleMutation();
    const deleteMutation = useDeleteScheduleMutation();
    const runMutation = useRunScheduleNowMutation();
    /** Lịch do người dùng bấm "Chạy ngay"; báo kết quả khi lần chạy đó kết thúc. */
    const watchedRunsRef = useRef<Set<number>>(new Set());

    useEffect(() => {
        const schedules = schedulesQuery.data;
        if (!schedules || watchedRunsRef.current.size === 0) {
            return;
        }
        for (const schedule of schedules) {
            if (!watchedRunsRef.current.has(schedule.id) || !schedule.lastStatus || schedule.lastStatus === 'running') {
                continue;
            }
            watchedRunsRef.current.delete(schedule.id);
            const detail = schedule.lastMessage ?? 'không có chi tiết';
            if (schedule.lastStatus === 'failed') {
                message.error({ content: `Lịch "${schedule.novelTitle}" lỗi: ${detail}`, duration: 8 });
            } else if (schedule.lastStatus === 'completed') {
                message.success({ content: `Lịch "${schedule.novelTitle}": ${detail}`, duration: 6 });
            } else {
                message.info({ content: `Lịch "${schedule.novelTitle}": ${detail}`, duration: 6 });
            }
        }
    }, [schedulesQuery.data]);

    const rows = useMemo(() => schedulesQuery.data ?? [], [schedulesQuery.data]);
    const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
    const currentPage = Math.min(page, pageCount);
    const pageRows = useMemo(() => {
        const start = (currentPage - 1) * pageSize;
        return rows.slice(start, start + pageSize);
    }, [currentPage, pageSize, rows]);

    const openCreate = () => {
        setEditing(null);
        setDrawerOpen(true);
    };

    const openEdit = (schedule: Schedule) => {
        setEditing(schedule);
        setDrawerOpen(true);
    };

    const toggleActive = (schedule: Schedule, active: boolean) => {
        updateMutation.mutate(
            { id: schedule.id, body: { active } },
            {
                onSuccess: () => message.success(active ? 'Đã bật lịch' : 'Đã tắt lịch'),
                onError: (error) => message.error(getErrorMessage(error, 'Không đổi được trạng thái lịch')),
            },
        );
    };

    const runNow = (schedule: Schedule) => {
        runMutation.mutate(schedule.id, {
            onSuccess: () => {
                watchedRunsRef.current.add(schedule.id);
                message.success('Đã bắt đầu chạy lịch. Theo dõi tiến độ trong cột Lần chạy.');
            },
            onError: (error) => message.error(getErrorMessage(error, 'Không chạy được lịch')),
        });
    };

    const confirmDelete = (schedule: Schedule) => {
        Modal.confirm({
            title: `Xóa lịch của "${schedule.novelTitle}"?`,
            content: 'Lịch sẽ không tự chạy nữa. Chương, audio và file trên Drive vẫn giữ nguyên.',
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: () =>
                deleteMutation.mutateAsync(schedule.id).then(
                    () => message.success('Đã xóa lịch định kỳ'),
                    (error) => {
                        message.error(getErrorMessage(error, 'Không xóa được lịch'));
                        return Promise.reject(error);
                    },
                ),
        });
    };

    const columns: ColumnsType<Schedule> = [
        {
            title: 'Truyện',
            key: 'novel',
            ellipsis: true,
            render: (_, schedule) => (
                <div className="schedule-novel">
                    <Image
                        src={getNovelCoverUrl({ id: schedule.novelId, coverImage: schedule.novelCoverImage })}
                        alt={schedule.novelTitle}
                        width={40}
                        height={54}
                        fallback={DEFAULT_NOVEL_COVER}
                        preview={{ mask: 'Xem ảnh' }}
                    />
                    <div className="novel-cell">
                        <Link className="novel-cell__title" to={`/novels/${schedule.novelId}`}>
                            {schedule.novelTitle}
                        </Link>
                        <span className="novel-cell__meta">{hostOf(schedule.novelUrl)}</span>
                    </div>
                </div>
            ),
        },
        {
            title: 'Định kỳ',
            key: 'period',
            width: 190,
            render: (_, schedule) => (
                <div className="schedule-period">
                    <Typography.Text strong>{schedule.timeOfDay}</Typography.Text>
                    <span className="novel-cell__meta">{formatScheduleDays(schedule.daysOfWeek)}</span>
                </div>
            ),
        },
        {
            title: 'Tự động',
            key: 'automation',
            width: 190,
            render: (_, schedule) => (
                <Space size={[4, 4]} wrap>
                    {schedule.autoCrawl ? <Tag color="blue">Cào</Tag> : null}
                    {schedule.autoTts ? <Tag color="purple">TTS</Tag> : null}
                    {schedule.autoDrive ? <Tag color="green">Drive</Tag> : null}
                    {!schedule.autoCrawl && !schedule.autoTts && !schedule.autoDrive ? (
                        <Typography.Text type="secondary">Không</Typography.Text>
                    ) : null}
                </Space>
            ),
        },
        {
            title: 'Lần chạy',
            key: 'lastRun',
            width: 190,
            render: (_, schedule) => <ScheduleStatusCell schedule={schedule} />,
        },
        {
            title: 'Kế tiếp',
            key: 'nextRun',
            width: 160,
            render: (_, schedule) => {
                if (!schedule.active) {
                    return (
                        <Typography.Text type="secondary" style={{ fontSize: 12.5 }}>
                            Đã tắt
                        </Typography.Text>
                    );
                }
                if (!schedule.nextRunAt) {
                    return <Typography.Text type="secondary">—</Typography.Text>;
                }
                return (
                    <Tooltip title={formatDateTime(schedule.nextRunAt)}>
                        <span className="novel-activity">{formatRelativeNext(schedule.nextRunAt)}</span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Hoạt động',
            key: 'active',
            width: 100,
            align: 'center',
            render: (_, schedule) => (
                <span onClick={(event) => event.stopPropagation()}>
                    <Switch
                        size="small"
                        checked={schedule.active}
                        loading={updateMutation.isPending && updateMutation.variables?.id === schedule.id}
                        onChange={(checked) => toggleActive(schedule, checked)}
                        aria-label={schedule.active ? 'Tắt lịch' : 'Bật lịch'}
                    />
                </span>
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 128,
            fixed: 'right',
            render: (_, schedule) => {
                const running = schedule.runStage !== 'idle';
                return (
                    <Space size={0} onClick={(event) => event.stopPropagation()}>
                        <Tooltip title={running ? 'Lịch đang chạy' : 'Chạy ngay'}>
                            <Button
                                type="text"
                                size="small"
                                icon={<ThunderboltOutlined />}
                                aria-label="Chạy lịch ngay"
                                disabled={running}
                                loading={runMutation.isPending && runMutation.variables === schedule.id}
                                onClick={() => runNow(schedule)}
                            />
                        </Tooltip>
                        <Tooltip title="Sửa">
                            <Button
                                type="text"
                                size="small"
                                icon={<EditOutlined />}
                                aria-label="Sửa lịch"
                                onClick={() => openEdit(schedule)}
                            />
                        </Tooltip>
                        <Tooltip title={running ? 'Đợi lịch chạy xong trước khi xóa' : 'Xóa'}>
                            <Button
                                type="text"
                                size="small"
                                className="row-action-delete"
                                icon={<DeleteOutlined />}
                                aria-label="Xóa lịch"
                                disabled={running}
                                onClick={() => confirmDelete(schedule)}
                            />
                        </Tooltip>
                    </Space>
                );
            },
        },
    ];

    const emptyNode = (
        <Empty description="Chưa có lịch định kỳ.">
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                Thêm lịch
            </Button>
        </Empty>
    );

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Typography.Title level={4} style={{ margin: 0 }}>
                    Lịch tự động
                </Typography.Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    Thêm lịch
                </Button>
            </Space>

            {schedulesQuery.isError ? (
                <Alert type="error" showIcon title="Không tải được lịch định kỳ" description={getErrorMessage(schedulesQuery.error)} />
            ) : null}

            <Card size="small" title="Thiết lập định kỳ">
                <div ref={areaRef}>
                    <Table<Schedule>
                        rowKey="id"
                        size="small"
                        columns={columns}
                        dataSource={pageRows}
                        loading={schedulesQuery.isLoading}
                        pagination={false}
                        locale={{ emptyText: emptyNode }}
                        scroll={fitTableScroll(1000, bodyHeight)}
                        onRow={(schedule) => ({
                            onClick: (event) => {
                                if (isRowActionTarget(event.target)) {
                                    return;
                                }
                                openEdit(schedule);
                            },
                            style: { cursor: 'pointer' },
                        })}
                    />
                    <ListPagination
                        current={currentPage}
                        pageSize={pageSize}
                        total={rows.length}
                        totalLabel={(total) => `${total} lịch`}
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

            <ScheduleFormDrawer
                open={drawerOpen}
                schedule={editing}
                onClose={() => setDrawerOpen(false)}
                onSaved={() => setDrawerOpen(false)}
            />
        </Space>
    );
}

/** Thời gian tương lai: "sau 2 giờ", "sau 3 ngày". */
function formatRelativeNext(value: string): string {
    const date = new Date(value);
    const diffMs = date.getTime() - Date.now();
    if (Number.isNaN(diffMs)) {
        return '';
    }
    if (diffMs <= 60_000) {
        return 'sắp chạy';
    }
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) {
        return `sau ${minutes} phút`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `sau ${hours} giờ`;
    }
    return `sau ${Math.floor(hours / 24)} ngày`;
}
