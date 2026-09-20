import { useState } from 'react';
import { Layout, Menu, Typography } from 'antd';
import { BookOutlined, DashboardOutlined, ReadOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
const { Sider, Content } = Layout;

export function MainLayout() {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const isHome = location.pathname === '/';
    const selectedKeys = isHome ? ['dashboard', 'novels'] : [];

    const goHome = (scrollToNovels = false) => {
        navigate('/');
        if (scrollToNovels) {
            requestAnimationFrame(() => {
                document.getElementById('novels-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        }
    };

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Sider
                collapsible
                collapsed={collapsed}
                onCollapse={setCollapsed}
                collapsedWidth={64}
                width={220}
                theme="light"
                style={{
                    borderRight: '1px solid #f0f0f0',
                    height: '100vh',
                    position: 'sticky',
                    top: 0,
                    overflow: 'auto',
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', paddingBottom: 48 }}>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: collapsed ? '16px 0' : '16px 20px',
                            justifyContent: collapsed ? 'center' : 'flex-start',
                            borderBottom: '1px solid #f0f0f0',
                        }}
                    >
                        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'inherit' }}>
                            <BookOutlined style={{ fontSize: 18 }} />
                            {!collapsed ? (
                                <Typography.Text strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>
                                    Novel Crawler
                                </Typography.Text>
                            ) : null}
                        </Link>
                    </div>

                    <Menu
                        mode="inline"
                        selectedKeys={selectedKeys}
                        style={{ flex: 1, borderInlineEnd: 'none' }}
                        onClick={({ key }) => {
                            if (key === 'dashboard') {
                                goHome(false);
                            } else if (key === 'novels') {
                                goHome(true);
                            }
                        }}
                        items={[
                            {
                                type: 'group',
                                label: 'Tổng quan',
                                children: [
                                    {
                                        key: 'dashboard',
                                        icon: <DashboardOutlined />,
                                        label: 'Dashboard',
                                    },
                                ],
                            },
                            {
                                type: 'group',
                                label: 'Thư viện',
                                children: [
                                    {
                                        key: 'novels',
                                        icon: <ReadOutlined />,
                                        label: 'Danh sách truyện',
                                    },
                                ],
                            },
                        ]}
                    />
                </div>
            </Sider>

            <Layout>
                <Content style={{ padding: 16, background: '#f5f5f5', minHeight: '100vh' }}>
                    <Outlet />
                </Content>
            </Layout>
        </Layout>
    );
}
