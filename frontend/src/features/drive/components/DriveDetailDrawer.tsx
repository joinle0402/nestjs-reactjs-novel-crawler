import { Drawer, Radio, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import type { DriveFileResult, DriveJob } from '@/features/drive/api/driveApi.ts';

type DriveFileRow = {
    key: string;
    chapterNumber: number;
    name: string;
    status: DriveFileResult['status'] | 'pending';
    error?: string;
};

export type DriveFileFilter = '' | 'uploaded' | 'skipped' | 'failed' | 'pending';

type DriveDetailDrawerProps = {
    job: DriveJob | null;
    initialFilter?: DriveFileFilter;
    onClose: () => void;
};

const STATUS_META: Record<DriveFileRow['status'], { label: string; color: string }> = {
    uploaded: { label: 'Đã upload', color: 'green' },
    skipped: { label: 'Bỏ qua (đã có)', color: 'cyan' },
    failed: { label: 'Lỗi', color: 'red' },
    pending: { label: 'Chưa xử lý', color: 'default' },
};

export function DriveDetailDrawer({ job, initialFilter = '', onClose }: DriveDetailDrawerProps) {
    const [filter, setFilter] = useState<DriveFileFilter>('');

    useEffect(() => {
        if (job) {
            setFilter(initialFilter);
        }
    }, [job, initialFilter]);

    const rows = useMemo<DriveFileRow[]>(() => {
        if (!job) {
            return [];
        }
        const byName = new Map<string, DriveFileRow>();
        // Kết quả từng file của lần chạy (worker ghi liên tục trong lúc chạy).
        for (const result of job.fileResults ?? []) {
            byName.set(result.name, {
                key: `${result.name}-${result.chapterNumber}`,
                chapterNumber: result.chapterNumber,
                name: result.name,
                status: result.status,
                error: result.error,
            });
        }
        // Job cũ không có fileResults: hiện ít nhất các file lỗi đã lưu.
        if (!job.fileResults?.length) {
            for (const failed of job.failedFiles ?? []) {
                byName.set(failed.name, {
                    key: `${failed.name}-${failed.chapterNumber}`,
                    chapterNumber: failed.chapterNumber,
                    name: failed.name,
                    status: 'failed',
                    error: failed.error,
                });
            }
        }
        // Chương trong phạm vi chưa có kết quả nào -> chưa xử lý.
        const knownNumbers = new Set([...byName.values()].map((row) => row.chapterNumber));
        for (const number of job.chapterNumbers ?? []) {
            if (!knownNumbers.has(number)) {
                byName.set(`chapter-${number}`, {
                    key: `chapter-${number}`,
                    chapterNumber: number,
                    name: `Chương ${number}`,
                    status: 'pending',
                });
            }
        }
        return [...byName.values()].sort((a, b) => a.chapterNumber - b.chapterNumber);
    }, [job]);

    const filtered = filter ? rows.filter((row) => row.status === filter) : rows;

    const columns: ColumnsType<DriveFileRow> = [
        { title: 'Chương', dataIndex: 'chapterNumber', width: 90 },
        { title: 'Tên file', dataIndex: 'name', ellipsis: true },
        {
            title: 'Kết quả',
            dataIndex: 'status',
            width: 140,
            render: (status: DriveFileRow['status']) => <Tag color={STATUS_META[status].color}>{STATUS_META[status].label}</Tag>,
        },
        { title: 'Lỗi', dataIndex: 'error', ellipsis: true },
    ];

    return (
        <Drawer
            title={job ? `Chi tiết lần upload #${job.id}` : 'Chi tiết lần upload'}
            placement="right"
            size={720}
            open={job !== null}
            onClose={onClose}
        >
            {job ? (
                <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                    <div>
                        <Typography.Text strong>{job.novelTitle}</Typography.Text>
                        <Typography.Text type="secondary"> — {job.progress.detail}</Typography.Text>
                    </div>
                    <Space size={24} wrap>
                        <span>Đã upload: {job.progress.done}</span>
                        <span>Bỏ qua (đã có): {job.progress.skipped}</span>
                        <span>Lỗi: {job.progress.failed}</span>
                        <span>Tổng: {job.progress.total}</span>
                    </Space>
                    {job.errorMessage ? <Typography.Text type="danger">{job.errorMessage}</Typography.Text> : null}
                    {!job.fileResults?.length ? (
                        <Typography.Text type="secondary">
                            Lần chạy này chưa ghi kết quả từng file (job cũ). Chỉ hiển thị file lỗi và số liệu tổng.
                        </Typography.Text>
                    ) : null}
                    <Radio.Group
                        value={filter}
                        onChange={(event) => setFilter(event.target.value as DriveFileFilter)}
                        options={[
                            { label: 'Tất cả', value: '' },
                            { label: 'Đã upload', value: 'uploaded' },
                            { label: 'Bỏ qua', value: 'skipped' },
                            { label: 'Lỗi', value: 'failed' },
                            { label: 'Chưa xử lý', value: 'pending' },
                        ]}
                        optionType="button"
                        size="small"
                    />
                    <Table
                        rowKey="key"
                        size="small"
                        columns={columns}
                        dataSource={filtered}
                        pagination={{ pageSize: 20, showSizeChanger: false }}
                        locale={{ emptyText: 'Chưa có kết quả nào' }}
                    />
                </Space>
            ) : null}
        </Drawer>
    );
}