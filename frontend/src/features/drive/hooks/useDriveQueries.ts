import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Modal, message } from 'antd';
import {
    getCurrentDriveJob,
    getDriveLogs,
    getDrivePreview,
    getDriveStatus,
    getLastDriveJob,
    isActiveDriveJob,
    startDriveJob,
    stopDriveJob,
    type DrivePreview,
    type StartDriveJobBody,
} from '@/features/drive/api/driveApi.ts';
import { chapterKeys } from '@/features/chapters/hooks/useChaptersQuery.ts';

export const driveKeys = {
    current: ['drive', 'current'] as const,
    logs: ['drive', 'logs'] as const,
    status: ['drive', 'status'] as const,
    previews: ['drive', 'preview'] as const,
    preview: (novelId: number, chapterRange?: string) => ['drive', 'preview', novelId, chapterRange ?? ''] as const,
    last: (novelId: number) => ['drive', 'last', novelId] as const,
};

const POLL_MS = 2500;

async function refreshDrivePreview(queryClient: ReturnType<typeof useQueryClient>, novelId: number): Promise<DrivePreview> {
    const preview = await getDrivePreview(novelId, undefined, { refresh: true });
    queryClient.setQueryData(driveKeys.preview(novelId, ''), preview);
    void queryClient.invalidateQueries({ queryKey: driveKeys.previews });
    void queryClient.invalidateQueries({ queryKey: chapterKeys.lists() });
    return preview;
}

export function useCurrentDriveJobQuery() {
    return useQuery({
        queryKey: driveKeys.current,
        queryFn: getCurrentDriveJob,
        staleTime: 0,
        refetchInterval: (query) => (isActiveDriveJob(query.state.data) ? POLL_MS : false),
    });
}

export function useDriveStatusQuery(enabled = true) {
    return useQuery({
        queryKey: driveKeys.status,
        queryFn: getDriveStatus,
        enabled,
    });
}

export function useDrivePreviewQuery(novelId: number | undefined, chapterRange?: string) {
    const range = chapterRange?.trim() || undefined;
    return useQuery({
        queryKey: driveKeys.preview(novelId ?? 0, range),
        queryFn: () => getDrivePreview(novelId!, range),
        enabled: Number.isFinite(novelId) && (novelId ?? 0) > 0,
        staleTime: 15_000,
    });
}

export function useLastDriveJobQuery(novelId: number | undefined, enabled = true) {
    return useQuery({
        queryKey: driveKeys.last(novelId ?? 0),
        queryFn: () => getLastDriveJob(novelId!),
        enabled: enabled && Number.isFinite(novelId) && (novelId ?? 0) > 0,
    });
}

export function useDriveLogsQuery(enabled = true) {
    return useQuery({
        queryKey: driveKeys.logs,
        queryFn: () => getDriveLogs(200),
        enabled,
        refetchInterval: 3000,
    });
}

export function useDriveJobWatch() {
    const queryClient = useQueryClient();
    const query = useCurrentDriveJobQuery();
    const wasActive = useRef(false);
    const toasted = useRef('');

    useEffect(() => {
        const job = query.data;
        const active = isActiveDriveJob(job);
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
            Modal.error({
                title: 'Upload Drive thất bại',
                content: job.errorMessage || 'Worker gặp lỗi khi upload. Vui lòng kiểm tra tab log.',
            });
        } else if (job.status === 'completed') {
            const { done, skipped, failed } = job.progress;
            if (failed > 0) {
                Modal.warning({
                    title: 'Upload Drive xong, một số file lỗi',
                    content: `${done} upload · ${skipped} bỏ qua · ${failed} lỗi. Bấm "Upload Drive" để chạy lại các file lỗi.`,
                });
            } else {
                message.success(`Đã upload Drive xong: ${done} file${skipped > 0 ? ` · bỏ qua ${skipped} file đã có` : ''}`);
            }
        }
        void refreshDrivePreview(queryClient, job.novelId);
        void queryClient.invalidateQueries({ queryKey: driveKeys.status });
    }, [query.data, queryClient]);

    return query;
}

export function useSyncDrivePreviewMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (novelId: number) => refreshDrivePreview(queryClient, novelId),
    });
}

export function useStartDriveJobMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: StartDriveJobBody) => startDriveJob(body),
        onSuccess: (job) => {
            queryClient.setQueryData(driveKeys.current, job);
            void queryClient.invalidateQueries({ queryKey: driveKeys.last(job.novelId) });
        },
    });
}

export function useStopDriveJobMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: stopDriveJob,
        onSuccess: (job) => {
            queryClient.setQueryData(driveKeys.current, job);
            void refreshDrivePreview(queryClient, job.novelId);
        },
    });
}