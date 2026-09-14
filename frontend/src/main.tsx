import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import viVN from 'antd/locale/vi_VN';
import App from './app/App.tsx';
import './app/app.css';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: 1,
            staleTime: 15_000,
        },
    },
});

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ConfigProvider locale={viVN}>
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>
        </ConfigProvider>
    </StrictMode>,
);
