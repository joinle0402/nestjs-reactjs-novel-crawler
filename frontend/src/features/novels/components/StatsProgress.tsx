import { Progress, Space, Typography } from 'antd';
import type { NovelStatsCounts } from '@/features/novels/api/novelsApi.ts';

type StatsProgressProps = {
    stats: NovelStatsCounts;
    size?: 'small' | 'default';
};

function percent(done: number, total: number): number {
    if (total <= 0) {
        return 0;
    }
    return Math.round((done / total) * 100);
}

export function StatsProgress({ stats, size = 'default' }: StatsProgressProps) {
    const crawlPercent = percent(stats.crawled, stats.total);
    const ttsPercent = percent(stats.ttsDone, stats.total);
    return (
        <Space orientation="vertical" size={size === 'small' ? 4 : 8} style={{ width: '100%' }}>
            <div>
                <Typography.Text type="secondary">
                    Crawl {stats.crawled}/{stats.total}
                    {stats.crawlFailed > 0 ? ` · lỗi ${stats.crawlFailed}` : ''}
                </Typography.Text>
                <Progress percent={crawlPercent} size={size} status={stats.crawlFailed > 0 ? 'exception' : undefined} />
            </div>
            <div>
                <Typography.Text type="secondary">
                    TTS {stats.ttsDone}/{stats.total}
                    {stats.ttsFailed > 0 ? ` · lỗi ${stats.ttsFailed}` : ''}
                </Typography.Text>
                <Progress percent={ttsPercent} size={size} status={stats.ttsFailed > 0 ? 'exception' : undefined} />
            </div>
        </Space>
    );
}
