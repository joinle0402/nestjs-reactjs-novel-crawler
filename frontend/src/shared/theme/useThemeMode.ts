import { useContext } from 'react';
import { ThemeModeContext } from './themeModeContext.ts';

export function useThemeMode() {
    const ctx = useContext(ThemeModeContext);
    if (!ctx) {
        throw new Error('useThemeMode phải dùng bên trong <ThemeModeProvider>');
    }
    return ctx;
}
