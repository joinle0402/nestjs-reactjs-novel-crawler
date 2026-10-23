import { useCallback, useEffect, useRef, useState } from 'react';
import { RATES, useAudioPlayer } from '@/features/audio/AudioPlayerContext.tsx';

const HOTKEYS_STORAGE_KEY = 'nc-player-hotkeys';
export const SEEK_STEP_SECONDS = 10;

export type PlayerShortcut = {
    /** Mỗi phần tử là một tổ hợp phím, render thành một phím riêng trong UI. */
    keys: string[];
    label: string;
};

export const PLAYER_SHORTCUTS: PlayerShortcut[] = [
    { keys: ['Space'], label: 'Phát / tạm dừng' },
    { keys: ['←', '→'], label: `Tua lùi / tiến ${SEEK_STEP_SECONDS} giây` },
    { keys: ['Shift + ←', 'Shift + →'], label: 'Chương trước / chương sau' },
    { keys: ['↑', '↓'], label: 'Tăng / giảm tốc độ đọc' },
];

export type PlayerHotkeys = {
    enabled: boolean;
    setEnabled: (enabled: boolean) => void;
};

function readStoredEnabled(): boolean {
    try {
        return localStorage.getItem(HOTKEYS_STORAGE_KEY) !== '0';
    } catch {
        return true;
    }
}

function isTypingTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) {
        return false;
    }
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/** Phần tử nhận Space/Enter để kích hoạt sẵn — không cướp phím của người dùng bàn phím. */
function isNativeActivator(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || typeof el.closest !== 'function') {
        return false;
    }
    return Boolean(
        el.closest(
            'button, a[href], [role="button"], [role="switch"], [role="checkbox"], [role="radio"], [role="tab"], [role="slider"]',
        ),
    );
}

function stepRate(rate: number, direction: 1 | -1): number {
    let index = RATES.findIndex((value) => Math.abs(value - rate) < 0.001);
    if (index < 0) {
        index = RATES.findIndex((value) => value > rate);
        index = index < 0 ? RATES.length - 1 : index;
    }
    const nextIndex = Math.min(RATES.length - 1, Math.max(0, index + direction));
    return RATES[nextIndex];
}

/**
 * Phím tắt toàn cục cho trình nghe truyện.
 * Chỉ hoạt động khi đang có chương trong player và không gõ phím trong ô nhập liệu.
 */
export function usePlayerHotkeys(): PlayerHotkeys {
    const player = useAudioPlayer();
    const playerRef = useRef(player);

    useEffect(() => {
        playerRef.current = player;
    }, [player]);

    const [enabled, setEnabledState] = useState(readStoredEnabled);

    const setEnabled = useCallback((next: boolean) => {
        setEnabledState(next);
        try {
            localStorage.setItem(HOTKEYS_STORAGE_KEY, next ? '1' : '0');
        } catch {
            // ignore storage failures
        }
    }, []);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing) {
                return;
            }
            if (event.ctrlKey || event.metaKey || event.altKey) {
                return;
            }
            if (isTypingTarget(event.target)) {
                return;
            }

            const current = playerRef.current;
            if (!current.track) {
                return;
            }

            switch (event.code) {
                case 'Space': {
                    if (isNativeActivator(event.target)) {
                        return;
                    }
                    event.preventDefault();
                    if (!event.repeat) {
                        current.togglePlay();
                    }
                    break;
                }
                case 'ArrowLeft': {
                    event.preventDefault();
                    if (event.shiftKey) {
                        if (!event.repeat) {
                            void current.playPrev();
                        }
                    } else {
                        current.seekBy(-SEEK_STEP_SECONDS);
                    }
                    break;
                }
                case 'ArrowRight': {
                    event.preventDefault();
                    if (event.shiftKey) {
                        if (!event.repeat) {
                            void current.playNext();
                        }
                    } else {
                        current.seekBy(SEEK_STEP_SECONDS);
                    }
                    break;
                }
                case 'ArrowUp':
                case 'ArrowDown': {
                    event.preventDefault();
                    if (!event.repeat) {
                        current.setRate(stepRate(current.rate, event.code === 'ArrowUp' ? 1 : -1));
                    }
                    break;
                }
                default:
                    break;
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [enabled]);

    return { enabled, setEnabled };
}
