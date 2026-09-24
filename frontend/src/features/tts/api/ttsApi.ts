import { axiosClient } from '@/shared/api/axiosClient.ts';

export type TtsScope = 'missing' | 'failed' | 'chapters';
export type TtsJobStatus = 'pending' | 'running' | 'stopped' | 'completed' | 'failed';

export type TtsVoiceOption = {
    id: string;
    label: string;
};

export type TtsSettings = {
    engine: string;
    voice: string;
    rate: string;
    bgmEnabled: boolean;
    voices: TtsVoiceOption[];
};

export type UpdateTtsSettingsBody = {
    engine: string;
    voice: string;
    rate: string;
    bgmEnabled: boolean;
};

export type TtsJobProgress = {
    done: number;
    total: number;
    currentChapterNumber: number | null;
    currentPercent: number | null;
    detail: string;
};

export type TtsJob = {
    id: number;
    novelId: number;
    novelTitle: string;
    scope: TtsScope;
    chapterRange: string | null;
    chapterNumbers: number[] | null;
    engine: string;
    voice: string;
    rate: string;
    bgmEnabled: boolean;
    status: TtsJobStatus;
    startedAt: string | null;
    finishedAt: string | null;
    errorMessage: string | null;
    progress: TtsJobProgress;
};

export type TtsChapterPreview = {
    error: string | null;
    preview: string | null;
    count: number;
    willRun: number;
};

export type TtsPreview = {
    missing: number;
    failed: number;
    chapters: TtsChapterPreview | null;
};

export type StartTtsJobBody = {
    novelId: number;
    scope: TtsScope;
    chapterRange?: string;
    engine?: string;
    voice?: string;
    rate?: string;
    bgmEnabled?: boolean;
};

export function isActiveTtsJob(job: TtsJob | null | undefined): boolean {
    return job?.status === 'pending' || job?.status === 'running';
}

export const getTtsSettings = () => axiosClient.get<TtsSettings>('/tts/settings');

export const updateTtsSettings = (body: UpdateTtsSettingsBody) => axiosClient.put<TtsSettings>('/tts/settings', body);

export const getTtsPreview = (novelId: number, chapterRange?: string) =>
    axiosClient.get<TtsPreview>('/tts/preview', {
        params: {
            novelId,
            ...(chapterRange ? { chapterRange } : {}),
        },
    });

export const getCurrentTtsJob = () => axiosClient.get<TtsJob | null>('/tts/jobs/current');

export const startTtsJob = (body: StartTtsJobBody) => axiosClient.post<TtsJob>('/tts/jobs', body);

export const stopTtsJob = () => axiosClient.post<TtsJob>('/tts/jobs/stop');
