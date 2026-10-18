import { useMemo, type ReactNode } from 'react';
import { Alert, Button, Card, Empty, Image, Progress, Skeleton, Space, Statistic, Table, Tag, Tooltip, Typography, theme } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    CloudDownloadOutlined,
    CloudUploadOutlined,
    CustomerServiceOutlined,
    PlusOutlined,
    ReadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useBgmTracksQuery } from '@/features/bgm/hooks/useBgmQueries.ts';
import { CRAWL_STATUS_COLOR, CRAWL_STATUS_LABEL, type CrawlJob } from '@/features/crawl/api/crawlApi.ts';
import { useCurrentCrawlJobQuery } from '@/features/crawl/hooks/useCrawlQueries.ts';
import { DRIVE_JOB_STATUS_COLOR, DRIVE_JOB_STATUS_LABEL, type DriveJob } from '@/features/drive/api/driveApi.ts';
import { useCurrentDriveJobQuery, useDriveStatusQuery } from '@/features/drive/hooks/useDriveQueries.ts';
import { useHealthQuery } from '@/features/health/hooks/useHealthQuery.ts';
import type { NovelListItem } from '@/features/novels/api/novelsApi.ts';
import { useNovelsQuery } from '@/features/novels/hooks/useNovelsQuery.ts';
import { DEFAULT_NOVEL_COVER, getNovelCoverUrl } from '@/features/novels/lib/novelCover.ts';
import { statusOf } from '@/features/novels/lib/novelStatus.ts';
import { formatDateTime, formatRelativeTime } from '@/shared/lib/relativeTime.ts';
import { isActiveTtsJob, type TtsJob, type TtsJobStatus } from '@/features/tts/api/ttsApi.ts';
import { useCurrentTtsJobQuery } from '@/features/tts/hooks/useTtsQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

const TTS_STATUS_LABEL: Record<TtsJobStatus, string> = {
    pending: 'Đang chờ',
    running: 'Đang chạy',
    stopped: 'Đã dừng',
    completed: 'Hoàn tất',
    failed: 'Lỗi',
};

const TTS_STATUS_COLOR: Record<TtsJobStatus, string> = {
    pending: 'warning',
    running: 'processing',
    stopped: 'warning',
    completed: 'success',
    failed: 'error',
};

type LibrarySummary = {
    novels: number;
    chapters: number;
    crawled: number;
    ttsDone: number;
    crawlFailed: number;
    ttsFailed: number;
    openNovels: number;
};

function percent(done: number, total: number): number {
    if (total <= 0) {
        return 0;
    }
    return Math.round((done / total) * 100);
}

function summarize(novels: NovelListItem[]): LibrarySummary {
    return novels.reduce<LibrarySummary>(
        (acc, novel) => {
            const stats = novel.stats;
            acc.novels += 1;
            acc.chapters += stats.total;
            acc.crawled += stats.crawled;
            acc.ttsDone += stats.ttsDone;
            acc.crawlFailed += stats.crawlFailed;
            acc.ttsFailed += stats.ttsFailed;
            if (stats.crawlFailed > 0 || stats.ttsFailed > 0 || stats.crawled < stats.total || stats.ttsDone < stats.total) {
                acc.openNovels += 1;
            }
            return acc;
        },
        { novels: 0, chapters: 0, crawled: 0, ttsDone: 0, crawlFailed: 0, ttsFailed: 0, openNovels: 0 },
    );
}

const ACTIVITY_LIMIT = 8;

function needsWork(novel: NovelListItem): boolean {
    const stats = novel.stats;
    return stats.crawlFailed > 0 || stats.ttsFailed > 0 || stats.crawled < stats.total || stats.ttsDone < stats.total;
}

function spotlight(novels: NovelListItem[]): NovelListItem[] {
    const open = novels.filter(needsWork);
    const pool = open.length > 0 ? open : novels;
    return [...pool]
        .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
        .slice(0, ACTIVITY_LIMIT);
}

function crawlDetail(job: CrawlJob): string {
    const title = job.novelTitle || job.url;
    const { completed, total, currentChapterNumber } = job.progress;
    const chapter = currentChapterNumber ? `, chương ${currentChapterNumber}` : '';
    return total > 0 ? `${title}, ${completed}/${total} chương${chapter}` : title;
}

function ttsDetail(job: TtsJob): string {
    const { done, total, currentChapterNumber } = job.progress;
    const chapter = currentChapterNumber ? `, chương ${currentChapterNumber}` : '';
    return total > 0 ? `${job.novelTitle}, ${done}/${total} chương${chapter}` : job.novelTitle;
}

function driveDetail(job: DriveJob): string {
    const { processed, total, currentFile } = job.progress;
    const file = currentFile ? `, ${currentFile}` : '';
    return total > 0 ? `${job.novelTitle}, ${processed}/${total} file${file}` : job.novelTitle;
}

export function DashboardPage() {
    const { token } = theme.useToken();
    const navigate = useNavigate();
    const novelsQuery = useNovelsQuery();
    const crawlQuery = useCurrentCrawlJobQuery();
    const ttsQuery = useCurrentTtsJobQuery();
    const driveQuery = useCurrentDriveJobQuery();
    const healthQuery = useHealthQuery();
    const driveStatusQuery = useDriveStatusQuery();
    const bgmQuery = useBgmTracksQuery();

    const novels = novelsQuery.data ?? [];
    const summary = useMemo(() => summarize(novels), [novels]);
    const rows = useMemo(() => spotlight(novels), [novels]);
    const libraryTitle = summary.openNovels > 0 ? 'Truyện chưa xong' : 'Truyện gần đây';

    const openNovel = (novelId: number) => {
        navigate(`/novels/${novelId}`);
    };

    const libraryColumns: ColumnsType<NovelListItem> = [
        {
            title: 'Ảnh',
            key: 'cover',
            width: 64,
            render: (_, novel) => (
                <span className="novel-cover-cell" onClick={(event) => event.stopPropagation()}>
                    <Image
                        src={getNovelCoverUrl(novel)}
                        alt={novel.title}
                        width={40}
                        height={54}
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
            render: (title: string, novel) => (
                <div className="dash-table__novel">
                    <Typography.Text strong ellipsis>
                        {title}
                    </Typography.Text>
                    <Typography.Text type="secondary" ellipsis>
                        {novel.author || 'Chưa có tác giả'}
                    </Typography.Text>
                </div>
            ),
        },
        {
            title: 'Crawl',
            key: 'crawl',
            width: 96,
            render: (_, novel) => (
                <StatusCount
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
            width: 96,
            render: (_, novel) => (
                <StatusCount
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
            width: 118,
            render: (value: string) => (
                <Tooltip title={formatDateTime(value)}>
                    <span>{formatRelativeTime(value)}</span>
                </Tooltip>
            ),
        },
    ];

    return (
        <div className="dash-page">
            <div className="dash-header">
                <div>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                        Dashboard
                    </Typography.Title>
                    <Typography.Text type="secondary">
                        {novelsQuery.isSuccess
                            ? `${summary.novels} truyện, ${summary.chapters} chương trong thư viện.`
                            : 'Tổng quan thư viện và các tác vụ đang chạy.'}
                    </Typography.Text>
                </div>
                <Space wrap>
                    <Button icon={<PlusOutlined />} onClick={() => navigate('/novels?create=1')}>
                        Thêm truyện
                    </Button>
                    <Button type="primary" icon={<ReadOutlined />} onClick={() => navigate('/novels')}>
                        Danh sách truyện
                    </Button>
                </Space>
            </div>

            {novelsQuery.isError ? (
                <Alert
                    type="error"
                    showIcon
                    title="Không tải được thư viện"
                    description={getErrorMessage(novelsQuery.error)}
                />
            ) : (
                <div className="dash-stats">
                    <StatCard title="Truyện" value={summary.novels} loading={novelsQuery.isLoading} note={summary.openNovels > 0 ? `${summary.openNovels} truyện chưa xong` : 'Đã xử lý xong'} />
                    <StatCard title="Chương" value={summary.chapters} loading={novelsQuery.isLoading} note="Tổng chương đã lưu" />
                    <StatCard
                        title="Đã crawl"
                        value={summary.crawled}
                        total={summary.chapters}
                        failed={summary.crawlFailed}
                        loading={novelsQuery.isLoading}
                    />
                    <StatCard
                        title="Đã TTS"
                        value={summary.ttsDone}
                        total={summary.chapters}
                        failed={summary.ttsFailed}
                        loading={novelsQuery.isLoading}
                    />
                </div>
            )}

            <div className={novelsQuery.isError ? 'dash-grid dash-grid--single' : 'dash-grid'}>
                {novelsQuery.isError ? null : (
                <Card
                    size="small"
                    title={libraryTitle}
                    extra={
                        <Button type="link" onClick={() => navigate('/novels')}>
                            Xem tất cả
                        </Button>
                    }
                >
                    {novelsQuery.isLoading ? (
                        <Skeleton active paragraph={{ rows: 4 }} />
                    ) : novels.length === 0 ? (
                        <Empty description="Chưa có truyện trong thư viện.">
                            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/novels?create=1')}>
                                Thêm truyện
                            </Button>
                        </Empty>
                    ) : (
                        <Table<NovelListItem>
                            rowKey="id"
                            size="small"
                            columns={libraryColumns}
                            dataSource={rows}
                            pagination={false}
                            onRow={(novel) => ({
                                style: { cursor: 'pointer' },
                                onClick: () => openNovel(novel.id),
                            })}
                        />
                    )}
                </Card>
                )}

                <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                    <Card size="small" title="Tác vụ">
                        <div className="dash-stack">
                            <JobRow
                                name="Crawler"
                                icon={<CloudDownloadOutlined />}
                                loading={crawlQuery.isLoading}
                                error={crawlQuery.isError}
                                label={crawlQuery.data ? CRAWL_STATUS_LABEL[crawlQuery.data.status] : 'Chưa có'}
                                color={crawlQuery.data ? CRAWL_STATUS_COLOR[crawlQuery.data.status] : 'default'}
                                detail={crawlQuery.data ? crawlDetail(crawlQuery.data) : 'Không có tác vụ'}
                                progress={
                                    crawlQuery.data && crawlQuery.data.progress.total > 0
                                        ? (crawlQuery.data.progress.percent ?? percent(crawlQuery.data.progress.completed, crawlQuery.data.progress.total))
                                        : null
                                }
                                active={Boolean(crawlQuery.data && (crawlQuery.data.status === 'running' || crawlQuery.data.status === 'pending'))}
                                onOpen={() => navigate('/crawl')}
                            />
                            <JobRow
                                name="Tạo audio"
                                icon={<CustomerServiceOutlined />}
                                loading={ttsQuery.isLoading}
                                error={ttsQuery.isError}
                                label={ttsQuery.data ? TTS_STATUS_LABEL[ttsQuery.data.status] : 'Chưa có'}
                                color={ttsQuery.data ? TTS_STATUS_COLOR[ttsQuery.data.status] : 'default'}
                                detail={ttsQuery.data ? ttsDetail(ttsQuery.data) : 'Không có tác vụ'}
                                progress={
                                    ttsQuery.data && ttsQuery.data.progress.total > 0
                                        ? percent(ttsQuery.data.progress.done, ttsQuery.data.progress.total)
                                        : null
                                }
                                active={isActiveTtsJob(ttsQuery.data)}
                                onOpen={() => navigate(ttsQuery.data ? `/novels/${ttsQuery.data.novelId}` : '/settings')}
                            />
                            <JobRow
                                name="Upload Drive"
                                icon={<CloudUploadOutlined />}
                                loading={driveQuery.isLoading}
                                error={driveQuery.isError}
                                label={driveQuery.data ? DRIVE_JOB_STATUS_LABEL[driveQuery.data.status] : 'Chưa có'}
                                color={driveQuery.data ? DRIVE_JOB_STATUS_COLOR[driveQuery.data.status] : 'default'}
                                detail={driveQuery.data ? driveDetail(driveQuery.data) : 'Không có tác vụ'}
                                progress={
                                    driveQuery.data && driveQuery.data.progress.total > 0 ? driveQuery.data.progress.percent : null
                                }
                                active={driveQuery.data?.status === 'running' || driveQuery.data?.status === 'pending'}
                                onOpen={() => navigate(driveQuery.data ? `/novels/${driveQuery.data.novelId}` : '/novels')}
                            />
                        </div>
                    </Card>

                    <Card size="small" title="Hệ thống">
                        <div className="dash-stack">
                            <MetaRow
                                label="API"
                                value={healthQuery.isError ? 'Không phản hồi' : healthQuery.data ? 'Đang chạy' : 'Đang kiểm tra'}
                                color={healthQuery.isError ? 'error' : healthQuery.data ? 'success' : 'default'}
                            />
                            <MetaRow
                                label="Google Drive"
                                value={driveLabel(driveStatusQuery.data, driveStatusQuery.isError, driveStatusQuery.isLoading)}
                                color={driveColor(driveStatusQuery.data, driveStatusQuery.isError, driveStatusQuery.isLoading)}
                            />
                            <MetaRow
                                label="Nhạc nền"
                                value={bgmQuery.isError ? 'Không tải được' : bgmQuery.isLoading ? 'Đang kiểm tra' : `${bgmQuery.data?.length ?? 0} bản`}
                                color={bgmQuery.isError ? 'error' : 'default'}
                                onOpen={() => navigate('/bgm')}
                            />
                        </div>
                        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
                            Upload Drive mở từ trang chi tiết từng truyện.
                        </Typography.Text>
                    </Card>
                </Space>
            </div>
        </div>
    );
}

function driveLabel(
    status: { credentialsReady: boolean; tokenReady: boolean } | undefined,
    isError: boolean,
    isLoading: boolean,
): string {
    if (isError) {
        return 'Không kiểm tra được';
    }
    if (isLoading || !status) {
        return 'Đang kiểm tra';
    }
    if (status.tokenReady) {
        return 'Đã đăng nhập';
    }
    if (status.credentialsReady) {
        return 'Chưa đăng nhập';
    }
    return 'Chưa cấu hình';
}

function driveColor(
    status: { credentialsReady: boolean; tokenReady: boolean } | undefined,
    isError: boolean,
    isLoading: boolean,
): string {
    if (isError) {
        return 'error';
    }
    if (isLoading || !status) {
        return 'default';
    }
    if (status.tokenReady) {
        return 'success';
    }
    if (status.credentialsReady) {
        return 'warning';
    }
    return 'default';
}

function StatusCount({
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
    return (
        <Tooltip title={`${label}: ${done}/${total}`}>
            <span className="status-count">
                <span
                    className={running ? 'status-dot status-dot--running' : 'status-dot'}
                    style={{ background: color }}
                />
                <span>
                    {done}/{total}
                </span>
            </span>
        </Tooltip>
    );
}

function StatCard({
    title,
    value,
    total,
    failed = 0,
    note,
    loading,
}: {
    title: string;
    value: number;
    total?: number;
    failed?: number;
    note?: string;
    loading: boolean;
}) {
    const showProgress = total != null;
    return (
        <Card size="small" className="dash-stat">
            {loading ? (
                <Skeleton active title={{ width: '40%' }} paragraph={{ rows: 1 }} />
            ) : (
                <>
                    <Statistic title={title} value={value} suffix={showProgress && total > 0 ? `/ ${total}` : undefined} />
                    {showProgress ? (
                        <Progress
                            percent={percent(value, total ?? 0)}
                            size="small"
                            showInfo={false}
                            status={failed > 0 ? 'exception' : undefined}
                        />
                    ) : null}
                    <Typography.Text type="secondary">
                        {showProgress ? (failed > 0 ? `${failed} chương lỗi` : 'Không có chương lỗi') : note}
                    </Typography.Text>
                </>
            )}
        </Card>
    );
}

function JobRow({
    name,
    icon,
    label,
    color,
    detail,
    progress,
    loading,
    error,
    active,
    onOpen,
}: {
    name: string;
    icon: ReactNode;
    label: string;
    color: string;
    detail: string;
    progress: number | null;
    loading: boolean;
    error: boolean;
    active: boolean;
    onOpen: () => void;
}) {
    const statusLabel = loading ? 'Đang kiểm tra' : error ? 'Không tải được' : label;
    const statusColor = loading ? 'default' : error ? 'error' : color;
    const statusDetail = loading ? 'Đang lấy trạng thái' : error ? 'Không đọc được tác vụ hiện tại' : detail;

    return (
        <button type="button" className={active ? 'dash-job dash-job--active' : 'dash-job'} onClick={onOpen}>
            <span className="dash-job__icon" aria-hidden="true">
                {icon}
            </span>
            <span className="dash-job__body">
                <Typography.Text strong>{name}</Typography.Text>
                <Typography.Text type="secondary" ellipsis>
                    {statusDetail}
                </Typography.Text>
                {progress != null && !loading && !error ? <Progress percent={progress} size="small" /> : null}
            </span>
            <Tag color={statusColor}>{statusLabel}</Tag>
        </button>
    );
}

function MetaRow({
    label,
    value,
    color,
    onOpen,
}: {
    label: string;
    value: string;
    color: string;
    onOpen?: () => void;
}) {
    const content = (
        <>
            <Typography.Text>{label}</Typography.Text>
            <Tag color={color}>{value}</Tag>
        </>
    );

    if (!onOpen) {
        return <div className="dash-meta">{content}</div>;
    }

    return (
        <button type="button" className="dash-meta dash-meta--button" onClick={onOpen}>
            {content}
        </button>
    );
}
