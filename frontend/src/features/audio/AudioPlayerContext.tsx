import { createContext, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react';
import { getChapter, getChapterAudioUrl, getChapterByNumber, type ChapterDetail, type ChapterNeighbor } from '@/features/chapters/api/chaptersApi.ts';
import { getPlayback, upsertPlayback } from '@/features/novels/api/novelsApi.ts';

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export type PlayableTrack = {
    novelId: number;
    novelTitle: string;
    chapterId: number;
    chapterNumber: number;
    chapterTitle: string;
    prev: ChapterNeighbor | null;
    next: ChapterNeighbor | null;
};

type AudioPlayerContextValue = {
    track: PlayableTrack | null;
    status: PlayerStatus;
    currentTime: number;
    duration: number;
    rate: number;
    errorMessage: string | null;
    playChapter: (input: {
        novelId: number;
        novelTitle: string;
        chapterId: number;
        resumePositionSec?: number;
    }) => Promise<void>;
    resumeNovel: (novelId: number, novelTitle: string) => Promise<void>;
    togglePlay: () => void;
    pause: () => void;
    seek: (seconds: number) => void;
    setRate: (rate: number) => void;
    playPrev: () => Promise<void>;
    playNext: () => Promise<void>;
    stop: () => void;
};

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

const PLAYBACK_SAVE_INTERVAL_MS = 8_000;
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function toTrack(novelTitle: string, chapter: ChapterDetail): PlayableTrack {
    return {
        novelId: chapter.novelId,
        novelTitle,
        chapterId: chapter.id,
        chapterNumber: chapter.chapterNumber,
        chapterTitle: chapter.title,
        prev: chapter.prev,
        next: chapter.next,
    };
}

async function findNearestWithAudio(
    start: ChapterNeighbor | null,
    direction: 'prev' | 'next',
    depth = 0,
): Promise<ChapterDetail | null> {
    if (!start || depth > 30) {
        return null;
    }
    const detail = await getChapter(start.id);
    if (detail.hasMp3) {
        return detail;
    }
    const neighbor = direction === 'prev' ? detail.prev : detail.next;
    return findNearestWithAudio(neighbor, direction, depth + 1);
}

export function AudioPlayerProvider({ children }: { children: ReactNode }) {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const trackRef = useRef<PlayableTrack | null>(null);
    const lastSavedAtRef = useRef(0);
    const pendingResumeRef = useRef<number | null>(null);

    const [track, setTrack] = useState<PlayableTrack | null>(null);
    const [status, setStatus] = useState<PlayerStatus>('idle');
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [rate, setRateState] = useState(1.5);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    useEffect(() => {
        trackRef.current = track;
    }, [track]);

    useEffect(() => {
        const audio = new Audio();
        audio.preload = 'metadata';
        audioRef.current = audio;

        const onLoaded = () => {
            setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
            const resumeAt = pendingResumeRef.current;
            if (resumeAt != null && resumeAt > 0 && resumeAt < audio.duration) {
                audio.currentTime = resumeAt;
                setCurrentTime(resumeAt);
            }
            pendingResumeRef.current = null;
        };
        const onTimeUpdate = () => setCurrentTime(audio.currentTime);
        const onPlay = () => setStatus('playing');
        const onPause = () => {
            if (!audio.ended) {
                setStatus('paused');
            }
        };
        const onWaiting = () => setStatus('loading');
        const onPlaying = () => setStatus('playing');
        const onError = () => {
            setStatus('error');
            setErrorMessage('Không phát được file MP3. Kiểm tra backend / STORAGE_ROOT.');
        };

        audio.addEventListener('loadedmetadata', onLoaded);
        audio.addEventListener('timeupdate', onTimeUpdate);
        audio.addEventListener('play', onPlay);
        audio.addEventListener('pause', onPause);
        audio.addEventListener('waiting', onWaiting);
        audio.addEventListener('playing', onPlaying);
        audio.addEventListener('error', onError);

        return () => {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            audio.removeEventListener('loadedmetadata', onLoaded);
            audio.removeEventListener('timeupdate', onTimeUpdate);
            audio.removeEventListener('play', onPlay);
            audio.removeEventListener('pause', onPause);
            audio.removeEventListener('waiting', onWaiting);
            audio.removeEventListener('playing', onPlaying);
            audio.removeEventListener('error', onError);
            audioRef.current = null;
        };
    }, []);

    const savePlayback = useEffectEvent(async (force = false) => {
        const current = trackRef.current;
        const audio = audioRef.current;
        if (!current || !audio) {
            return;
        }
        const now = Date.now();
        if (!force && now - lastSavedAtRef.current < PLAYBACK_SAVE_INTERVAL_MS) {
            return;
        }
        lastSavedAtRef.current = now;
        try {
            await upsertPlayback(current.novelId, {
                chapterNumber: current.chapterNumber,
                positionSec: Math.max(0, audio.currentTime || 0),
            });
        } catch {
            // ignore transient save errors
        }
    });

    const loadAndPlay = useEffectEvent(async (novelTitle: string, chapter: ChapterDetail, resumePositionSec?: number) => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        if (!chapter.hasMp3) {
            setStatus('error');
            setErrorMessage('Chương này chưa có MP3.');
            return;
        }

        await savePlayback(true);

        const nextTrack = toTrack(novelTitle, chapter);
        setTrack(nextTrack);
        setErrorMessage(null);
        setStatus('loading');
        setCurrentTime(resumePositionSec ?? 0);
        setDuration(0);
        pendingResumeRef.current = resumePositionSec ?? null;
        lastSavedAtRef.current = 0;

        audio.src = getChapterAudioUrl(chapter.id);
        console.log(rate);
        
        audio.playbackRate = rate;
        audio.load();
        try {
            await audio.play();
            setStatus('playing');
        } catch {
            setStatus('paused');
        }
    });

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }

        const onEnded = () => {
            void (async () => {
                await savePlayback(true);
                const current = trackRef.current;
                if (!current?.next) {
                    setStatus('paused');
                    return;
                }
                try {
                    const nextChapter = current.next.hasMp3 ? await getChapter(current.next.id) : await findNearestWithAudio(current.next, 'next');
                    if (!nextChapter) {
                        setStatus('paused');
                        return;
                    }
                    await loadAndPlay(current.novelTitle, nextChapter, 0);
                } catch {
                    setStatus('error');
                    setErrorMessage('Không tải được chương tiếp theo.');
                }
            })();
        };

        audio.addEventListener('ended', onEnded);
        return () => audio.removeEventListener('ended', onEnded);
    }, [loadAndPlay, savePlayback]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        const onTimeUpdateSave = () => {
            void savePlayback(false);
        };
        audio.addEventListener('timeupdate', onTimeUpdateSave);
        return () => audio.removeEventListener('timeupdate', onTimeUpdateSave);
    }, [savePlayback]);

    useEffect(() => {
        const onUnload = () => {
            void savePlayback(true);
        };
        window.addEventListener('beforeunload', onUnload);
        return () => window.removeEventListener('beforeunload', onUnload);
    }, [savePlayback]);

    const playChapter: AudioPlayerContextValue['playChapter'] = async ({ novelId, novelTitle, chapterId, resumePositionSec }) => {
        setStatus('loading');
        setErrorMessage(null);
        try {
            const chapter = await getChapter(chapterId);
            if (chapter.novelId !== novelId) {
                throw new Error('Chapter không thuộc truyện này');
            }
            await loadAndPlay(novelTitle, chapter, resumePositionSec);
        } catch {
            setStatus('error');
            setErrorMessage('Không tải được chương để nghe.');
        }
    };

    const resumeNovel: AudioPlayerContextValue['resumeNovel'] = async (novelId, novelTitle) => {
        setStatus('loading');
        setErrorMessage(null);
        try {
            const playback = await getPlayback(novelId);
            if (!playback) {
                setStatus('idle');
                setErrorMessage('Chưa có vị trí nghe đã lưu.');
                return;
            }
            const chapter = await getChapterByNumber(novelId, playback.chapterNumber);
            await loadAndPlay(novelTitle, chapter, playback.positionSec);
        } catch {
            setStatus('error');
            setErrorMessage('Không tiếp tục nghe được từ vị trí đã lưu.');
        }
    };

    const togglePlay = () => {
        const audio = audioRef.current;
        if (!audio || !track) {
            return;
        }
        if (audio.paused) {
            void audio.play().then(() => setStatus('playing')).catch(() => setStatus('paused'));
        } else {
            audio.pause();
            void savePlayback(true);
            setStatus('paused');
        }
    };

    const pause = () => {
        audioRef.current?.pause();
        void savePlayback(true);
        setStatus('paused');
    };

    const seek = (seconds: number) => {
        const audio = audioRef.current;
        if (!audio || !Number.isFinite(seconds)) {
            return;
        }
        audio.currentTime = Math.max(0, Math.min(seconds, audio.duration || seconds));
        setCurrentTime(audio.currentTime);
        void savePlayback(true);
    };

    const setRate = (nextRate: number) => {
        const audio = audioRef.current;
        setRateState(nextRate);
        if (audio) {
            audio.playbackRate = nextRate;
        }
    };

    const playPrev = async () => {
        const current = trackRef.current;
        if (!current?.prev) {
            return;
        }
        try {
            const prevChapter = current.prev.hasMp3 ? await getChapter(current.prev.id) : await findNearestWithAudio(current.prev, 'prev');
            if (!prevChapter) return;
            await loadAndPlay(current.novelTitle, prevChapter, 0);
        } catch {
            setStatus('error');
            setErrorMessage('Không tải được chương trước.');
        }
    };

    const playNext = async () => {
        const current = trackRef.current;
        if (!current?.next) {
            return;
        }
        try {
            const nextChapter = current.next.hasMp3 ? await getChapter(current.next.id) : await findNearestWithAudio(current.next, 'next');
            if (!nextChapter) return;
            await loadAndPlay(current.novelTitle, nextChapter, 0);
        } catch {
            setStatus('error');
            setErrorMessage('Không tải được chương tiếp theo.');
        }
    };

    const stop = () => {
        const audio = audioRef.current;
        void savePlayback(true);
        if (audio) {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
        }
        setTrack(null);
        setStatus('idle');
        setCurrentTime(0);
        setDuration(0);
        setErrorMessage(null);
    };

    const value: AudioPlayerContextValue = {
        track,
        status,
        currentTime,
        duration,
        rate,
        errorMessage,
        playChapter,
        resumeNovel,
        togglePlay,
        pause,
        seek,
        setRate,
        playPrev,
        playNext,
        stop,
    };

    return <AudioPlayerContext.Provider value={value}>{children}</AudioPlayerContext.Provider>;
}

export function useAudioPlayer() {
    const ctx = useContext(AudioPlayerContext);
    if (!ctx) {
        throw new Error('useAudioPlayer must be used within AudioPlayerProvider');
    }
    return ctx;
}

export { RATES };
