import { Alert, Breadcrumb, Card, Col, Empty, Row, Select, Space, Spin, Statistic, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMemo } from 'react';
import { useNovelQuery } from '@/features/novels/hooks/useNovelQuery.ts';
import { useNovelStatsQuery } from '@/features/novels/hooks/useNovelStatsQuery.ts';
import { useChaptersQuery } from '@/features/chapters/hooks/useChaptersQuery.ts';
import type { ChapterListItem, ListChaptersParams } from '@/features/chapters/api/chaptersApi.ts';
import { JobStatusTag } from '@/shared/ui/JobStatusTag.tsx';
import { JOB_STATUS_OPTIONS, JobStatus, type JobStatus as JobStatusValue } from '@/shared/types/jobStatus.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';
import { parseRouteId } from '@/shared/lib/parseRouteId.ts';

const PAGE_SIZE = 50;

function readStatusParam(value: string | null): JobStatusValue | undefined {
    if (!value) {
        return undefined;
    }
    return Object.values(JobStatus).includes(value as JobStatusValue) ? (value as JobStatusValue) : undefined;
}

function readBooleanParam(value: string | null): boolean | undefined {
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    return undefined;
}

export function NovelDetailPage() {
    const { novelId: novelIdParam } = useParams();
    const novelId = parseRouteId(novelIdParam);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
    const crawlStatus = readStatusParam(searchParams.get('crawlStatus'));
    const ttsStatus = readStatusParam(searchParams.get('ttsStatus'));
    const hasMp3 = readBooleanParam(searchParams.get('hasMp3'));

    const chapterParams: ListChaptersParams = useMemo(
        () => ({
            page,
            limit: PAGE_SIZE,
            crawlStatus,
            ttsStatus,
            hasMp3,
        }),
        [page, crawlStatus, ttsStatus, hasMp3],
    );

    const novelQuery = useNovelQuery(novelId);
    const statsQuery = useNovelStatsQuery(novelId);
    const chaptersQuery = useChaptersQuery(novelId, chapterParams);

    const updateFilters = (patch: Record<string, string | undefined>) => {
        const next = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(patch)) {
            if (value) {
                next.set(key, value);
            } else {
                next.delete(key);
            }
        }
        if (!patch.page) {
            next.delete('page');
        }
        setSearchParams(next);
    };

    const columns: ColumnsType<ChapterListItem> = [
        {
            title: '#',
            dataIndex: 'chapterNumber',
            width: 80,
        },
        {
            title: 'Chương',
            dataIndex: 'title',
            ellipsis: true,
            render: (title: string, chapter) => <Link to={`/novels/${novelId}/chapters/${chapter.id}`}>{title}</Link>,
        },
        {
            title: 'Crawl',
            dataIndex: 'crawlStatus',
            width: 120,
            render: (status: JobStatusValue) => <JobStatusTag status={status} />,
        },
        {
            title: 'TTS',
            dataIndex: 'ttsStatus',
            width: 120,
            render: (status: JobStatusValue) => <JobStatusTag status={status} />,
        },
        {
            title: 'MP3',
            dataIndex: 'hasMp3',
            width: 90,
            render: (value: boolean) => (value ? <Tag color="green">Có</Tag> : <Tag>Chưa</Tag>),
        },
    ];

    if (!novelId) {
        return <Alert type="error" showIcon title="ID truyện không hợp lệ" />;
    }

    if (novelQuery.isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
                <Spin size="large" />
            </div>
        );
    }

    if (novelQuery.isError || !novelQuery.data) {
        return <Alert type="error" showIcon title="Không tải được truyện" description={getErrorMessage(novelQuery.error)} />;
    }

    const novel = novelQuery.data;
    const stats = statsQuery.data;

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Breadcrumb
                items={[
                    { title: <Link to="/">Dashboard</Link> },
                    { title: novel.title },
                ]}
            />

            <Card size="small">
                <Typography.Title level={4} style={{ marginTop: 0, marginBottom: 4 }}>
                    {novel.title}
                </Typography.Title>
                <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                    {novel.author || 'Không rõ tác giả'}
                    {novel.url ? (
                        <>
                            {' · '}
                            <Typography.Link href={novel.url} target="_blank" rel="noreferrer">
                                Nguồn
                            </Typography.Link>
                        </>
                    ) : null}
                </Typography.Paragraph>
                {novel.summary ? (
                    <Typography.Paragraph ellipsis={{ rows: 2, expandable: 'collapsible' }} type="secondary" style={{ marginBottom: 12 }}>
                        {novel.summary}
                    </Typography.Paragraph>
                ) : null}

                <Row gutter={[12, 12]}>
                    <Col xs={12} md={6}>
                        <Statistic title="Tổng chương" value={stats?.total ?? '—'} loading={statsQuery.isLoading} />
                    </Col>
                    <Col xs={12} md={6}>
                        <Statistic title="Đã crawl" value={stats?.crawled ?? '—'} loading={statsQuery.isLoading} />
                    </Col>
                    <Col xs={12} md={6}>
                        <Statistic title="Đã TTS" value={stats?.ttsDone ?? '—'} loading={statsQuery.isLoading} />
                    </Col>
                    <Col xs={12} md={6}>
                        <Statistic
                            title="Lỗi crawl / TTS"
                            value={stats ? `${stats.crawlFailed} / ${stats.ttsFailed}` : '—'}
                            loading={statsQuery.isLoading}
                        />
                    </Col>
                </Row>
            </Card>

            <Card size="small" title="Mục lục">
                <Space wrap style={{ marginBottom: 12 }}>
                    <Select
                        allowClear
                        placeholder="Lọc crawl"
                        style={{ width: 160 }}
                        options={JOB_STATUS_OPTIONS}
                        value={crawlStatus}
                        onChange={(value) => updateFilters({ crawlStatus: value })}
                    />
                    <Select
                        allowClear
                        placeholder="Lọc TTS"
                        style={{ width: 160 }}
                        options={JOB_STATUS_OPTIONS}
                        value={ttsStatus}
                        onChange={(value) => updateFilters({ ttsStatus: value })}
                    />
                    <Space>
                        <Switch checked={hasMp3 === true} onChange={(checked) => updateFilters({ hasMp3: checked ? 'true' : undefined })} />
                        <Typography.Text>Chỉ chương có MP3</Typography.Text>
                    </Space>
                </Space>

                {chaptersQuery.isError ? (
                    <Alert type="error" showIcon title="Không tải được mục lục" description={getErrorMessage(chaptersQuery.error)} />
                ) : !chaptersQuery.isLoading && !chaptersQuery.data?.data.length ? (
                    <Empty description="Không có chương phù hợp bộ lọc." />
                ) : (
                    <Table<ChapterListItem>
                        rowKey="id"
                        size="small"
                        columns={columns}
                        dataSource={chaptersQuery.data?.data}
                        loading={chaptersQuery.isFetching}
                        pagination={{
                            current: chaptersQuery.data?.meta.page ?? page,
                            pageSize: PAGE_SIZE,
                            total: chaptersQuery.data?.meta.total ?? 0,
                            showSizeChanger: false,
                            showTotal: (total) => `${total} chương`,
                        }}
                        onChange={(pagination) => updateFilters({ page: String(pagination.current ?? 1) })}
                        onRow={(chapter) => ({
                            style: { cursor: 'pointer' },
                            onClick: () => navigate(`/novels/${novelId}/chapters/${chapter.id}`),
                        })}
                        scroll={{ x: 720 }}
                    />
                )}
            </Card>
        </Space>
    );
}
