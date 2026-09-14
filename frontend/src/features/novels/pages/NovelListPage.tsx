import { Alert, Card, Col, Empty, Row, Spin, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useNovelsQuery } from '@/features/novels/hooks/useNovelsQuery.ts';
import { StatsProgress } from '@/features/novels/components/StatsProgress.tsx';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

export function NovelListPage() {
    const { data, isLoading, isError, error } = useNovelsQuery();

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

    if (!data?.length) {
        return (
            <Card>
                <Empty description="Chưa có truyện. Cào bằng Python worker rồi tải lại trang." />
            </Card>
        );
    }

    return (
        <Row gutter={[16, 16]}>
            {data.map((novel) => (
                <Col xs={24} lg={12} key={novel.id}>
                    <Link to={`/novels/${novel.id}`} style={{ display: 'block', color: 'inherit' }}>
                        <Card hoverable>
                            <Typography.Title level={4} style={{ marginTop: 0 }}>
                                {novel.title}
                            </Typography.Title>
                            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                                {novel.author || 'Không rõ tác giả'} · {novel.stats.total} chương
                            </Typography.Paragraph>
                            {novel.summary ? (
                                <Typography.Paragraph ellipsis={{ rows: 3 }} type="secondary">
                                    {novel.summary}
                                </Typography.Paragraph>
                            ) : null}
                            <StatsProgress stats={novel.stats} size="small" />
                        </Card>
                    </Link>
                </Col>
            ))}
        </Row>
    );
}
