import { Button, Drawer, Space } from 'antd';
import { FileTextOutlined } from '@ant-design/icons';
import { useEffect, useRef } from 'react';
import { useCrawlLogsQuery } from '@/features/crawl/hooks/useCrawlQueries.ts';

type CrawlLogDrawerProps = {
    open: boolean;
    jobId: number | null;
    title: string;
    onClose: () => void;
};

export function CrawlLogDrawer({ open, jobId, title, onClose }: CrawlLogDrawerProps) {
    const logQuery = useCrawlLogsQuery(open, jobId);
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (open && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [open, logQuery.data?.lines?.length]);

    return (
        <Drawer
            title={
                <Space>
                    <FileTextOutlined />
                    <span>Log cào: {title}</span>
                </Space>
            }
            placement="bottom"
            height={380}
            open={open}
            onClose={onClose}
            extra={
                <Button size="small" onClick={() => void logQuery.refetch()} loading={logQuery.isFetching}>
                    Làm mới
                </Button>
            }
        >
            <div className="tts-log-viewer">
                {logQuery.data?.lines && logQuery.data.lines.length > 0 ? (
                    logQuery.data.lines.map((line, index) => {
                        const isErr = line.includes('Error') || line.includes('Lỗi') || line.includes('LỖI') || line.includes('failed') || line.includes('Exception');
                        const isSuccess = line.includes('xong') || line.includes('Đã lưu') || line.includes('Hoàn tất');
                        return (
                            <div key={`${index}-${line.slice(0, 24)}`} className={`tts-log-line ${isErr ? 'tts-log-line--err' : isSuccess ? 'tts-log-line--ok' : ''}`}>
                                {line}
                            </div>
                        );
                    })
                ) : (
                    <div className="tts-log-empty">Chưa có log của phiên này.</div>
                )}
                <div ref={logEndRef} />
            </div>
        </Drawer>
    );
}
