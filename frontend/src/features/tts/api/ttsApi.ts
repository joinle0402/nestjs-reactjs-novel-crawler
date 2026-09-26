import { axiosClient } from '@/shared/api/axiosClient.ts';

export type TtsScope = 'missing' | 'failed' | 'chapters';
export type TtsJobStatus = 'pending' | 'running' | 'stopped' | 'completed' | 'failed';

export type TtsVoiceOption = {
    id: string;
    label: string;
};

export type TtsEngineOption = {
    id: string;
    label: string;
    rateApplies: boolean;
    voices: TtsVoiceOption[];
};

export type TtsSettings = {
    engine: string;
    voice: string;
    rate: string;
    bgmEnabled: boolean;
    voices: TtsVoiceOption[];
    engines: TtsEngineOption[];
};

export type UpdateTtsSettingsBody = {
    engine: string;
    voice: string;
    rate: string;
    bgmEnabled: boolean;
};

export type TtsSampleBody = {
    engine: string;
    voice: string;
    rate: string;
    text: string;
};

export type TtsJobProgress = {
    done: number;
    total: number;
    currentChapterNumber: number | null;
    currentPercent: number | null;
    currentCharsDone: number | null;
    currentCharsTotal: number | null;
    totalCharsDone: number;
    totalChars: number;
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

export const synthesizeTtsSample = (body: TtsSampleBody) =>
    axiosClient.post<Blob>('/tts/sample', body, {
        responseType: 'blob',
        timeout: 10 * 60 * 1000,
    });

export async function getSavedTtsSample(params: { engine: string; voice: string; rate: string }): Promise<Blob | null> {
    try {
        const blob = await axiosClient.get<Blob>('/tts/sample/saved', {
            params,
            responseType: 'blob',
            timeout: 20000,
        });
        if (!(blob instanceof Blob) || blob.size < 100) {
            return null;
        }
        return blob;
    } catch {
        return null;
    }
}

export const getTtsPreview = (novelId: number, chapterRange?: string) =>
    axiosClient.get<TtsPreview>('/tts/preview', {
        params: {
            novelId,
            ...(chapterRange ? { chapterRange } : {}),
        },
    });

export const getCurrentTtsJob = () => axiosClient.get<TtsJob | null>('/tts/jobs/current');

export const getTtsLogs = (lines = 150) =>
    axiosClient.get<{ lines: string[] }>('/tts/jobs/logs', {
        params: { lines },
    });

export const startTtsJob = (body: StartTtsJobBody) => axiosClient.post<TtsJob>('/tts/jobs', body);

export const stopTtsJob = () => axiosClient.post<TtsJob>('/tts/jobs/stop');
