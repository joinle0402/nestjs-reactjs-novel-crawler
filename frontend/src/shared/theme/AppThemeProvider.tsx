import { ConfigProvider, theme as antdTheme } from 'antd';
import type { ReactNode } from 'react';
import viVN from 'antd/locale/vi_VN';
import { ACCENTS } from './themeModeContext.ts';
import { useThemeMode } from './useThemeMode.ts';

/** Bọc toàn app: đổi algorithm của antd theo theme mode và colorPrimary theo accent. */
export function AppThemeProvider({ children }: { children: ReactNode }) {
    const { mode, accent } = useThemeMode();

    return (
        <ConfigProvider
            locale={viVN}
            theme={{
                algorithm: mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
                token: { colorPrimary: ACCENTS[accent].colorPrimary },
            }}
        >
            {children}
        </ConfigProvider>
    );
}
