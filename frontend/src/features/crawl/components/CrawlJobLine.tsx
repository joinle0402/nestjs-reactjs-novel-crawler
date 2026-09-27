import { Button, Space, Typography, message } from 'antd';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CrawlJob } from '@/features/crawl/api/crawlApi.ts';
import { CrawlLogDrawer } from '@/features/crawl/components/CrawlLogDrawer.tsx';
import { useCrawlActionMutation } from '@/features/crawl/hooks/useCrawlQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

type CrawlJobLineProps = {
    job: CrawlJob;
};

export function CrawlJobLine({ job }: CrawlJobLineProps) {
    const cancelMutation = useCrawlActionMutation('cancel');
    const [logOpen, setLogOpen] = useState(false);
    const label = job.novelTitle || job.url;
    const href = job.novelId ? `/novels/${job.novelId}` : '/crawl';

    return (
        <div className="tts-job-line">
            <Typography.Text ellipsis className="tts-job-line__text">
                <Link to="/crawl">
                    Đang cào: {label}
                    {job.progress.total > 0 ? ` — ${job.progress.completed}/${job.progress.total}` : ''}
                </Link>
                {job.novelId ? (
                    <>
                        {' '}
                        <Link to={href}>mở truyện</Link>
                    </>
                ) : null}
            </Typography.Text>
            <Space size={4}>
                <Button size="small" onClick={() => setLogOpen(true)}>
                    Xem log
                </Button>
                <Button
                    size="small"
                    danger
                    loading={cancelMutation.isPending}
                    onClick={() => {
                        cancelMutation.mutate(job.id, {
                            onSuccess: () => message.success('Đã hủy job cào'),
                            onError: (error) => message.error(getErrorMessage(error, 'Hủy job thất bại')),
                        });
                    }}
                >
                    Hủy
                </Button>
            </Space>
            <CrawlLogDrawer open={logOpen} jobId={job.id} title={label} onClose={() => setLogOpen(false)} />
        </div>
    );
}
