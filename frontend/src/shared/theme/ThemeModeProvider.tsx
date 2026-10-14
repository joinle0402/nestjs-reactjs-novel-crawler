import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { THEME_MODE_STORAGE_KEY, ThemeModeContext } from './themeModeContext.ts';
import type { ThemeMode } from './themeModeContext.ts';

function getInitialMode(): ThemeMode {
    try {
        const saved = localStorage.getItem(THEME_MODE_STORAGE_KEY);
        if (saved === 'light' || saved === 'dark') {
            return saved;
        }
    } catch {
        // localStorage có thể bị chặn (private mode) — fallback theo hệ điều hành
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
    const [mode, setMode] = useState<ThemeMode>(getInitialMode);

    // Đồng bộ CSS variables trong app.css qua attribute trên <html>
    useEffect(() => {
        document.documentElement.dataset.theme = mode;
    }, [mode]);

    const toggle = useCallback(() => {
        setMode((prev) => {
            const next = prev === 'dark' ? 'light' : 'dark';
            try {
                localStorage.setItem(THEME_MODE_STORAGE_KEY, next);
            } catch {
                // Không lưu được thì vẫn đổi mode cho phiên hiện tại
            }
            return next;
        });
    }, []);

    const value = useMemo(() => ({ mode, toggle }), [mode, toggle]);

    return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}
