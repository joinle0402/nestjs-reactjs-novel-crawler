import { Card, Typography } from 'antd';

export function DashboardPage() {
    return (
        <Card>
            <Typography.Title level={2}>Novel Crawler</Typography.Title>

            <Typography.Text>Backend: Connected</Typography.Text>
        </Card>
    );
}