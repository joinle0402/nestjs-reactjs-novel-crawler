import { createContext } from 'react';

export type ThemeMode = 'light' | 'dark';

export type Accent = 'blue' | 'violet' | 'green' | 'orange';

/**
 * Chỉ cần khai báo `colorPrimary` gốc — antd tự derive toàn bộ
 * hover/active/border từ một màu này, kể cả ở dark mode.
 */
export const ACCENTS: Record<Accent, { label: string; colorPrimary: string }> = {
    blue: { label: 'Xanh dương', colorPrimary: '#1677ff' },
    violet: { label: 'Tím', colorPrimary: '#722ed1' },
    green: { label: 'Lục', colorPrimary: '#389e0d' },
    orange: { label: 'Cam', colorPrimary: '#fa8c16' },
};

export const ACCENT_ORDER: readonly Accent[] = ['blue', 'violet', 'green', 'orange'];

export function isAccent(value: string | null): value is Accent {
    return value !== null && Object.hasOwn(ACCENTS, value);
}

export type ThemeModeContextValue = {
    mode: ThemeMode;
    toggle: () => void;
    accent: Accent;
    setAccent: (accent: Accent) => void;
};

export const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export const THEME_MODE_STORAGE_KEY = 'theme-mode';
export const THEME_ACCENT_STORAGE_KEY = 'theme-accent';
