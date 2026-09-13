import { Card, Spin, Typography } from 'antd';
import { useHealthQuery } from '@/features/health/hooks/useHealthQuery.ts';

export function DashboardPage() {
    const { data, isLoading, isError } = useHealthQuery();
    const statusText = isLoading ? 'Checking...' : isError ? 'Backend: Offline' : `Backend: ${data?.status === 'ok' ? 'Connected' : data?.status}`;
    return (
        <Card>
            <Typography.Title level={2}>Novel Crawler</Typography.Title>
            {isLoading ? <Spin /> : <Typography.Text>{statusText}</Typography.Text>}
        </Card>
    );
}
