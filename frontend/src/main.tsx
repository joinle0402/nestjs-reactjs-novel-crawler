import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeModeProvider } from '@/shared/theme/ThemeModeProvider.tsx';
import { AppThemeProvider } from '@/shared/theme/AppThemeProvider.tsx';
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
        <ThemeModeProvider>
            <AppThemeProvider>
                <QueryClientProvider client={queryClient}>
                    <App />
                </QueryClientProvider>
            </AppThemeProvider>
        </ThemeModeProvider>
    </StrictMode>,
);
