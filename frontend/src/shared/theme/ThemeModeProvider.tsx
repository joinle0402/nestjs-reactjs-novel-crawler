import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
    ACCENT_ORDER,
    THEME_ACCENT_STORAGE_KEY,
    THEME_MODE_STORAGE_KEY,
    ThemeModeContext,
    isAccent,
} from './themeModeContext.ts';
import type { Accent, ThemeMode } from './themeModeContext.ts';

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

function getInitialAccent(): Accent {
    try {
        const saved = localStorage.getItem(THEME_ACCENT_STORAGE_KEY);
        if (isAccent(saved)) {
            return saved;
        }
    } catch {
        // Bỏ qua — dùng màu mặc định
    }
    return ACCENT_ORDER[0];
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
    const [mode, setMode] = useState<ThemeMode>(getInitialMode);
    const [accent, setAccentState] = useState<Accent>(getInitialAccent);

    // Đồng bộ CSS variables trong app.css qua attribute trên <html>
    useEffect(() => {
        document.documentElement.dataset.theme = mode;
    }, [mode]);

    useEffect(() => {
        document.documentElement.dataset.accent = accent;
    }, [accent]);

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

    const setAccent = useCallback((next: Accent) => {
        setAccentState(next);
        try {
            localStorage.setItem(THEME_ACCENT_STORAGE_KEY, next);
        } catch {
            // Bỏ qua — vẫn đổi accent cho phiên hiện tại
        }
    }, []);

    const value = useMemo(() => ({ mode, toggle, accent, setAccent }), [mode, toggle, accent, setAccent]);

    return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}
