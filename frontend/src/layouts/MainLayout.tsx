import { useState } from 'react';
import { Button, Layout, Menu, Switch, Typography, theme } from 'antd';
import {
    BookOutlined,
    CheckOutlined,
    CloudDownloadOutlined,
    CustomerServiceOutlined,
    DashboardOutlined,
    MoonOutlined,
    ReadOutlined,
    SettingOutlined,
    SunOutlined,
} from '@ant-design/icons';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BottomPlayer } from '@/features/audio/BottomPlayer.tsx';
import { useAudioPlayer } from '@/features/audio/AudioPlayerContext.tsx';
import { isActiveTtsJob } from '@/features/tts/api/ttsApi.ts';
import { useTtsJobWatch } from '@/features/tts/hooks/useTtsQueries.ts';
import { isActiveCrawlJob } from '@/features/crawl/api/crawlApi.ts';
import { useCrawlJobWatch } from '@/features/crawl/hooks/useCrawlQueries.ts';
import { isActiveDriveJob } from '@/features/drive/api/driveApi.ts';
import { useDriveJobWatch } from '@/features/drive/hooks/useDriveQueries.ts';
import { ACCENTS, ACCENT_ORDER } from '@/shared/theme/themeModeContext.ts';
import type { Accent } from '@/shared/theme/themeModeContext.ts';
import { useThemeMode } from '@/shared/theme/useThemeMode.ts';

const { Sider, Content } = Layout;

export function MainLayout() {
    const [collapsed, setCollapsed] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();
    const { mode, toggle, accent, setAccent } = useThemeMode();
    const { token } = theme.useToken();
    const { track } = useAudioPlayer();
    const jobQuery = useTtsJobWatch();
    const jobActive = isActiveTtsJob(jobQuery.data);
    const crawlQuery = useCrawlJobWatch();
    const crawlActive = isActiveCrawlJob(crawlQuery.data);
    const driveQuery = useDriveJobWatch();
    const driveActive = isActiveDriveJob(driveQuery.data);

    const isHome = location.pathname === '/';
    const selectedKeys = location.pathname.startsWith('/settings')
        ? ['settings']
        : location.pathname.startsWith('/crawl')
          ? ['crawl']
          : location.pathname.startsWith('/bgm')
            ? ['bgm']
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
                    borderRight: `1px solid ${token.colorBorderSecondary}`,
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
                            borderBottom: `1px solid ${token.colorBorderSecondary}`,
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
                            } else if (key === 'bgm') {
                                navigate('/bgm');
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
                                        key: 'bgm',
                                        icon: <CustomerServiceOutlined />,
                                        label: 'Nhạc nền',
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

                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '12px 20px',
                            justifyContent: collapsed ? 'center' : 'flex-start',
                        }}
                    >
                        <Switch
                            size="small"
                            checked={mode === 'dark'}
                            onChange={toggle}
                            checkedChildren={<MoonOutlined />}
                            unCheckedChildren={<SunOutlined />}
                            aria-label="Chuyển giao diện tối/sáng"
                        />
                        {!collapsed ? (
                            <Typography.Text style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
                                Giao diện tối
                            </Typography.Text>
                        ) : null}
                    </div>

                    <div
                        role="radiogroup"
                        aria-label="Màu chủ đạo"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '4px 20px 12px',
                            justifyContent: collapsed ? 'center' : 'flex-start',
                        }}
                    >
                        {ACCENT_ORDER.map((key) => {
                            const meta = ACCENTS[key as Accent];
                            const selected = accent === key;
                            return (
                                <Button
                                    key={key}
                                    shape="circle"
                                    size="small"
                                    role="radio"
                                    aria-checked={selected}
                                    aria-label={`Màu chủ đạo ${meta.label}`}
                                    title={meta.label}
                                    onClick={() => setAccent(key)}
                                    style={{
                                        backgroundColor: meta.colorPrimary,
                                        borderColor: meta.colorPrimary,
                                        boxShadow: selected ? `0 0 0 2px ${token.colorText}` : undefined,
                                    }}
                                    icon={selected ? <CheckOutlined style={{ color: '#fff', fontSize: 10 }} /> : null}
                                />
                            );
                        })}
                    </div>
                </div>
            </Sider>

            <Layout>
                <Content
                    className={track ? 'layout-with-player' : jobActive || crawlActive || driveActive ? 'layout-with-tts' : undefined}
                    style={{ padding: 16, background: token.colorBgLayout, minHeight: '100vh' }}
                >
                    <Outlet />
                </Content>
                <BottomPlayer siderWidth={collapsed ? 64 : 220} />
            </Layout>
        </Layout>
    );
}
