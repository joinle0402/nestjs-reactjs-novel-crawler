import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { message } from 'antd';
import {
    getCurrentTtsJob,
    getTtsPreview,
    getTtsSettings,
    isActiveTtsJob,
    startTtsJob,
    stopTtsJob,
    updateTtsSettings,
    type StartTtsJobBody,
    type UpdateTtsSettingsBody,
} from '@/features/tts/api/ttsApi.ts';
import { chapterKeys } from '@/features/chapters/hooks/useChaptersQuery.ts';
import { novelKeys } from '@/features/novels/hooks/useNovelsQuery.ts';

export const ttsKeys = {
    current: ['tts', 'current'] as const,
    settings: ['tts', 'settings'] as const,
    previews: ['tts', 'preview'] as const,
    preview: (novelId: number, chapterRange?: string) => ['tts', 'preview', novelId, chapterRange ?? ''] as const,
};

const POLL_MS = 3000;

export function useCurrentTtsJobQuery() {
    return useQuery({
        queryKey: ttsKeys.current,
        queryFn: getCurrentTtsJob,
        staleTime: 0,
        refetchInterval: (query) => (isActiveTtsJob(query.state.data) ? POLL_MS : false),
    });
}

export function useTtsJobWatch() {
    const queryClient = useQueryClient();
    const query = useCurrentTtsJobQuery();
    const wasActive = useRef(false);
    const toasted = useRef('');

    useEffect(() => {
        const job = query.data;
        const active = isActiveTtsJob(job);
        if (active) {
            wasActive.current = true;
            return;
        }
        if (!wasActive.current || !job) {
            return;
        }
        const key = `${job.id}:${job.status}`;
        if (toasted.current === key) {
            return;
        }
        toasted.current = key;
        wasActive.current = false;
        if (job.status === 'failed') {
            message.error(job.errorMessage || 'Tạo audio thất bại');
        } else if (job.status === 'completed') {
            message.success('Đã tạo audio xong');
        }
        void queryClient.invalidateQueries({ queryKey: chapterKeys.lists() });
        void queryClient.invalidateQueries({ queryKey: novelKeys.all });
        void queryClient.invalidateQueries({ queryKey: ttsKeys.previews });
    }, [query.data, queryClient]);

    return query;
}

export function useTtsPreviewQuery(novelId: number | undefined, chapterRange?: string, refetchInterval?: number | false) {
    const range = chapterRange?.trim() || undefined;
    return useQuery({
        queryKey: ttsKeys.preview(novelId ?? 0, range),
        queryFn: () => getTtsPreview(novelId!, range),
        enabled: Number.isFinite(novelId) && (novelId ?? 0) > 0,
        refetchInterval,
    });
}

export function useTtsSettingsQuery() {
    return useQuery({
        queryKey: ttsKeys.settings,
        queryFn: getTtsSettings,
    });
}

export function useStartTtsJobMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: StartTtsJobBody) => startTtsJob(body),
        onSuccess: (job) => {
            queryClient.setQueryData(ttsKeys.current, job);
        },
    });
}

export function useStopTtsJobMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: stopTtsJob,
        onSuccess: (job) => {
            queryClient.setQueryData(ttsKeys.current, job);
            void queryClient.invalidateQueries({ queryKey: chapterKeys.lists() });
            void queryClient.invalidateQueries({ queryKey: novelKeys.all });
            void queryClient.invalidateQueries({ queryKey: ttsKeys.previews });
        },
    });
}

export function useUpdateTtsSettingsMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: UpdateTtsSettingsBody) => updateTtsSettings(body),
        onSuccess: (settings) => {
            queryClient.setQueryData(ttsKeys.settings, settings);
        },
    });
}
