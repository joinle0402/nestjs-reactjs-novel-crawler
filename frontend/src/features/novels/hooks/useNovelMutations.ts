import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    createNovel,
    deleteNovel,
    removeNovelCover,
    syncNovelChapters,
    updateNovel,
    uploadNovelCover,
    type CreateNovelBody,
    type UpdateNovelBody,
} from '@/features/novels/api/novelsApi.ts';
import { novelKeys } from '@/features/novels/hooks/useNovelsQuery.ts';
import { chapterKeys } from '@/features/chapters/hooks/useChaptersQuery.ts';

export function useCreateNovelMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: CreateNovelBody) => createNovel(body),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: novelKeys.lists() });
        },
    });
}

export function useUpdateNovelMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, body }: { id: number; body: UpdateNovelBody }) => updateNovel(id, body),
        onSuccess: (novel) => {
            void queryClient.invalidateQueries({ queryKey: novelKeys.lists() });
            void queryClient.invalidateQueries({ queryKey: novelKeys.detail(novel.id) });
        },
    });
}

export function useUploadNovelCoverMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, body }: { id: number; body: FormData }) => uploadNovelCover(id, body),
        onSuccess: (novel) => {
            void queryClient.invalidateQueries({ queryKey: novelKeys.lists() });
            void queryClient.invalidateQueries({ queryKey: novelKeys.detail(novel.id) });
        },
    });
}

export function useRemoveNovelCoverMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => removeNovelCover(id),
        onSuccess: (novel) => {
            void queryClient.invalidateQueries({ queryKey: novelKeys.lists() });
            void queryClient.invalidateQueries({ queryKey: novelKeys.detail(novel.id) });
        },
    });
}

export function useSyncNovelChaptersMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => syncNovelChapters(id),
        onSuccess: (_result, id) => {
            void queryClient.invalidateQueries({ queryKey: novelKeys.lists() });
            void queryClient.invalidateQueries({ queryKey: novelKeys.stats(id) });
            void queryClient.invalidateQueries({ queryKey: chapterKeys.lists() });
        },
    });
}

export function useDeleteNovelMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => deleteNovel(id),
        onSuccess: (_data, id) => {
            void queryClient.invalidateQueries({ queryKey: novelKeys.lists() });
            void queryClient.removeQueries({ queryKey: novelKeys.detail(id) });
            void queryClient.invalidateQueries({ queryKey: chapterKeys.lists() });
        },
    });
}

export type BulkDeleteResult = {
    succeeded: number;
    failed: number;
    total: number;
};

/** Xóa nhiều truyện một lượt; chạy song song và chỉ invalidate cache một lần. */
export function useBulkDeleteNovelsMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (ids: number[]): Promise<BulkDeleteResult> => {
            const results = await Promise.allSettled(ids.map((id) => deleteNovel(id)));
            const failed = results.filter((result) => result.status === 'rejected').length;
            return { succeeded: ids.length - failed, failed, total: ids.length };
        },
        onSuccess: (_result, ids) => {
            void queryClient.invalidateQueries({ queryKey: novelKeys.lists() });
            for (const id of ids) {
                void queryClient.removeQueries({ queryKey: novelKeys.detail(id) });
            }
            void queryClient.invalidateQueries({ queryKey: chapterKeys.lists() });
        },
    });
}

export type BulkSyncResult = {
    synced: number;
    failed: number;
    count: number;
};

/** Đồng bộ nhiều truyện tuần tự để tránh dồn tải lên trang nguồn. */
export function useBulkSyncNovelsMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (ids: number[]): Promise<BulkSyncResult> => {
            let synced = 0;
            let failed = 0;
            for (const id of ids) {
                try {
                    const result = await syncNovelChapters(id);
                    synced += result.synced;
                } catch {
                    failed += 1;
                }
            }
            return { synced, failed, count: ids.length };
        },
        onSuccess: (_result, ids) => {
            void queryClient.invalidateQueries({ queryKey: novelKeys.lists() });
            for (const id of ids) {
                void queryClient.invalidateQueries({ queryKey: novelKeys.stats(id) });
            }
            void queryClient.invalidateQueries({ queryKey: chapterKeys.lists() });
        },
    });
}
