import { useState } from 'react';
import { Layout, Menu, Typography } from 'antd';
import { BookOutlined, CloudDownloadOutlined, DashboardOutlined, ReadOutlined, SettingOutlined } from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BottomPlayer } from '@/features/audio/BottomPlayer.tsx';
import { useAudioPlayer } from '@/features/audio/AudioPlayerContext.tsx';
import { isActiveTtsJob } from '@/features/tts/api/ttsApi.ts';
import { useTtsJobWatch } from '@/features/tts/hooks/useTtsQueries.ts';
import { isActiveCrawlJob } from '@/features/crawl/api/crawlApi.ts';
import { useCrawlJobWatch } from '@/features/crawl/hooks/useCrawlQueries.ts';

const { Sider, Content } = Layout;

export function MainLayout() {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { track } = useAudioPlayer();
    const jobQuery = useTtsJobWatch();
    const jobActive = isActiveTtsJob(jobQuery.data);
    const crawlQuery = useCrawlJobWatch();
    const crawlActive = isActiveCrawlJob(crawlQuery.data);

    const isHome = location.pathname === '/';
    const selectedKeys = location.pathname.startsWith('/settings')
        ? ['settings']
        : location.pathname.startsWith('/crawl')
          ? ['crawl']
          : isHome
            ? ['dashboard', 'novels']
            : [];

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
                            } else if (key === 'settings') {
                                navigate('/settings');
                            } else if (key === 'crawl') {
                                navigate('/crawl');
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
                            {
                                type: 'group',
                                label: 'Hệ thống',
                                children: [
                                    {
                                        key: 'crawl',
                                        icon: <CloudDownloadOutlined />,
                                        label: 'Crawler',
                                    },
                                    {
                                        key: 'settings',
                                        icon: <SettingOutlined />,
                                        label: 'Cài đặt',
                                    },
                                ],
                            },
                        ]}
                    />
                </div>
            </Sider>

            <Layout>
                <Content
                    className={track ? 'layout-with-player' : jobActive || crawlActive ? 'layout-with-tts' : undefined}
                    style={{ padding: 16, background: '#f5f5f5', minHeight: '100vh' }}
                >
                    <Outlet />
                </Content>
                <BottomPlayer siderWidth={collapsed ? 64 : 220} />
            </Layout>
        </Layout>
    );
}
