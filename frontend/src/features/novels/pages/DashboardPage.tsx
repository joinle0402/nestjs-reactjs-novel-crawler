import { useMemo, useState } from 'react';
import { Alert, Card, Col, Empty, Input, Progress, Row, Space, Spin, Statistic, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { useNovelsQuery } from '@/features/novels/hooks/useNovelsQuery.ts';
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
    const [search, setSearch] = useState('');

    const aggregates = useMemo(() => {
        if (!data?.length) {
            return { novels: 0, chapters: 0, crawled: 0, ttsDone: 0, crawlFailed: 0, ttsFailed: 0 };
        }
        return data.reduce(
            (acc, novel) => {
                acc.novels += 1;
                acc.chapters += novel.stats.total;
                acc.crawled += novel.stats.crawled;
                acc.ttsDone += novel.stats.ttsDone;
                acc.crawlFailed += novel.stats.crawlFailed;
                acc.ttsFailed += novel.stats.ttsFailed;
                return acc;
            },
            { novels: 0, chapters: 0, crawled: 0, ttsDone: 0, crawlFailed: 0, ttsFailed: 0 },
        );
    }, [data]);

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

    const columns: ColumnsType<NovelListItem> = [
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

            <Row gutter={[12, 12]}>
                <Col xs={12} sm={6}>
                    <Card size="small">
                        <Statistic title="Tổng truyện" value={aggregates.novels} />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card size="small">
                        <Statistic title="Tổng chương" value={aggregates.chapters} />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card size="small">
                        <Statistic title="Crawl" value={percent(aggregates.crawled, aggregates.chapters)} suffix="%" />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card size="small">
                        <Statistic title="TTS" value={percent(aggregates.ttsDone, aggregates.chapters)} suffix="%" />
                    </Card>
                </Col>
            </Row>

            <Card
                id="novels-table"
                size="small"
                title="Danh sách truyện"
                extra={
                    <Input.Search
                        allowClear
                        placeholder="Tìm theo tên / tác giả"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{ width: 240 }}
                    />
                }
            >
                {!data?.length ? (
                    <Empty description="Chưa có truyện. Cào bằng Python worker rồi tải lại trang." />
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
                        scroll={{ x: 720 }}
                    />
                )}
            </Card>
        </Space>
    );
}
