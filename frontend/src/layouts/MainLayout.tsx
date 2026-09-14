import { Layout, Space, Typography } from 'antd';
import { BookOutlined } from '@ant-design/icons';
import { Link, Outlet } from 'react-router-dom';
import { HealthBadge } from '@/shared/ui/HealthBadge.tsx';

const { Header, Content } = Layout;

export function MainLayout() {
    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Header
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: '#fff',
                    color: 'rgba(0, 0, 0, 0.88)',
                    borderBottom: '1px solid #f0f0f0',
                    paddingInline: 24,
                    position: 'sticky',
                    top: 0,
                    zIndex: 10,
                }}
            >
                <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}>
                    <BookOutlined />
                    <Typography.Text strong style={{ fontSize: 16 }}>
                        Novel Crawler
                    </Typography.Text>
                </Link>
                <Space>
                    <HealthBadge />
                </Space>
            </Header>
            <Content style={{ padding: 24 }}>
                <div style={{ maxWidth: 1100, margin: '0 auto' }}>
                    <Outlet />
                </div>
            </Content>
        </Layout>
    );
}
