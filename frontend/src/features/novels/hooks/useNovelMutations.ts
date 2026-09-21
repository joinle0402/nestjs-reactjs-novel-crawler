import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    createNovel,
    deleteNovel,
    updateNovel,
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
