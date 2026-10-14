import { ConfigProvider, theme as antdTheme } from 'antd';
import type { ReactNode } from 'react';
import viVN from 'antd/locale/vi_VN';
import { useThemeMode } from './useThemeMode.ts';

/** Bọc toàn app: đổi algorithm của antd theo theme mode (dark/light). */
export function AppThemeProvider({ children }: { children: ReactNode }) {
    const { mode } = useThemeMode();

    return (
        <ConfigProvider
            locale={viVN}
            theme={{
                algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
            }}
        >
            {children}
        </ConfigProvider>
    );
}
