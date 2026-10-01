import { Button, Popconfirm, Progress, Space, Tag, Tooltip, Typography, message } from 'antd';
import {
    CaretRightOutlined,
    FileTextOutlined,
    PauseOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    CRAWL_STATUS_COLOR,
    CRAWL_STATUS_LABEL,
    isActiveCrawlJob,
    type CrawlChapterStatus,
    type CrawlJob,
} from '@/features/crawl/api/crawlApi.ts';
import { CrawlDetailDrawer } from '@/features/crawl/components/CrawlDetailDrawer.tsx';
import { CrawlRestTag } from '@/features/crawl/components/CrawlRestTag.tsx';
import { useCrawlActionMutation, useCrawlChaptersQuery, useCrawlJobQuery } from '@/features/crawl/hooks/useCrawlQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

type CrawlJobLineProps = {
    job: CrawlJob;
};

export function CrawlJobLine({ job }: CrawlJobLineProps) {
    const [detailOpen, setDetailOpen] = useState(false);
    const [chapterFilter, setChapterFilter] = useState<CrawlChapterStatus | ''>('');
    const pauseMutation = useCrawlActionMutation('pause');
    const resumeMutation = useCrawlActionMutation('resume');
    const continueMutation = useCrawlActionMutation('continue');
    const cancelMutation = useCrawlActionMutation('cancel');
    const retryMutation = useCrawlActionMutation('retry');
    const actionPending = pauseMutation.isPending || resumeMutation.isPending || continueMutation.isPending || cancelMutation.isPending || retryMutation.isPending;

    const label = job.novelTitle || job.url;
    const href = job.novelId ? `/novels/${job.novelId}` : '/crawl';
    const isWaiting = job.status === 'waiting_for_manual_action';
    const isRunning = job.status === 'running';
    const isPaused = job.status === 'paused';

    const detailQuery = useCrawlJobQuery(detailOpen ? job.id : null);
    const chaptersQuery = useCrawlChaptersQuery(detailOpen ? job.id : null, chapterFilter, isActiveCrawlJob(detailQuery.data ?? job));
    const detail = detailQuery.data ?? job;

    const openDetail = (filter: CrawlChapterStatus | '' = '') => {
        setChapterFilter(filter);
        setDetailOpen(true);
    };

    const run = (action: 'pause' | 'resume' | 'continue' | 'cancel' | 'retry', id: number) => {
        const mutation = { pause: pauseMutation, resume: resumeMutation, continue: continueMutation, cancel: cancelMutation, retry: retryMutation }[action];
        mutation.mutate(id, {
            onSuccess: () => {
                const text = { pause: 'Đã tạm dừng job cào', resume: 'Đã tiếp tục job cào', continue: 'Đã tiếp tục cào', cancel: 'Đã hủy job cào', retry: 'Đã cào lại chương lỗi' }[action];
                message.success(text);
            },
            onError: (error) => message.error(getErrorMessage(error, 'Thao tác thất bại')),
        });
    };

    return (
        <>
            <div
                className="tts-job-line tts-job-line--clickable"
                role="button"
                tabIndex={0}
                aria-label={`Xem chi tiết tác vụ cào: ${label}`}
                onClick={() => openDetail()}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openDetail();
                    }
                }}
            >
                <Tag icon={isRunning ? <SyncOutlined spin /> : undefined} color={CRAWL_STATUS_COLOR[job.status]} className="tts-job-line__status">
                    {CRAWL_STATUS_LABEL[job.status]}
                </Tag>
                <Typography.Text ellipsis className="tts-job-line__text">
                    <Link to={href} onClick={(event) => event.stopPropagation()}>
                        {label}
                        {job.progress.total > 0 ? ` — ${job.progress.completed}/${job.progress.total}` : ''}
                    </Link>
                </Typography.Text>
                {isRunning && job.progress.currentChapterNumber != null ? (
                    <Typography.Text type="secondary" className="tts-job-line__current" onClick={(event) => event.stopPropagation()}>
                        {`Đang cào: Chương ${job.progress.currentChapterNumber} — [${job.progress.completed + job.progress.failed + job.progress.skipped + 1}/${job.progress.total}]`}
                    </Typography.Text>
                ) : null}
                <CrawlRestTag restUntil={isRunning ? job.restUntil : null} restKind={job.restKind} />
                <div className="tts-job-line__progress" onClick={(event) => event.stopPropagation()}>
                    <Progress
                        percent={job.progress.percent ?? 0}
                        size="small"
                        status={job.progress.percent == null || isRunning ? 'active' : undefined}
                    />
                </div>
                {job.progress.failed > 0 ? (
                    <Tooltip title="Xem các chương lỗi">
                        <Tag color="error" className="tts-job-line__failed" onClick={(event) => { event.stopPropagation(); openDetail('failed'); }}>
                            {job.progress.failed} lỗi
                        </Tag>
                    </Tooltip>
                ) : null}
                <Space size={4} className="tts-job-line__actions" onClick={(event) => event.stopPropagation()}>
                    {isWaiting ? (
                        <Button type="primary" size="small" icon={<CaretRightOutlined />} loading={continueMutation.isPending} onClick={() => run('continue', job.id)}>
                            Đã xử lý, tiếp tục
                        </Button>
                    ) : null}
                    {isRunning ? (
                        <Button size="small" icon={<PauseOutlined />} loading={pauseMutation.isPending} onClick={() => run('pause', job.id)}>
                            Tạm dừng
                        </Button>
                    ) : null}
                    {isPaused ? (
                        <Button type="primary" size="small" icon={<CaretRightOutlined />} loading={resumeMutation.isPending} onClick={() => run('resume', job.id)}>
                            Tiếp tục
                        </Button>
                    ) : null}
                    <Button size="small" icon={<FileTextOutlined />} onClick={() => openDetail()}>
                        Chi tiết
                    </Button>
                    <Popconfirm
                        title="Hủy job cào?"
                        description="Các chương đã cào xong vẫn được giữ lại."
                        okText="Hủy job"
                        okType="danger"
                        cancelText="Đóng"
                        onConfirm={() => run('cancel', job.id)}
                    >
                        <Button size="small" danger loading={cancelMutation.isPending}>
                            Hủy
                        </Button>
                    </Popconfirm>
                </Space>
            </div>
            <CrawlDetailDrawer
                job={detailOpen ? detail : null}
                chapters={chaptersQuery.data ?? []}
                chaptersLoading={chaptersQuery.isFetching}
                chapterFilter={chapterFilter}
                activeJobId={job.id}
                actionPending={actionPending}
                onChapterFilter={setChapterFilter}
                onClose={() => setDetailOpen(false)}
                onAction={run}
            />
        </>
    );
}
