import { Layout } from 'antd';
import { Outlet } from 'react-router-dom';

const { Content } = Layout;

export function MainLayout() {
    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Content>
                <Outlet />
            </Content>
        </Layout>
    );
}
