import { createContext } from 'react';

export type ThemeMode = 'light' | 'dark';

export type ThemeModeContextValue = {
    mode: ThemeMode;
    toggle: () => void;
};

export const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export const THEME_MODE_STORAGE_KEY = 'theme-mode';
