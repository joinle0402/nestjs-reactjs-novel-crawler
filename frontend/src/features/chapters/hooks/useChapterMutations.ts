import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
    createChapter,
    deleteChapter,
    updateChapter,
    type CreateChapterBody,
    type UpdateChapterBody,
} from '@/features/chapters/api/chaptersApi.ts';
import { chapterKeys } from '@/features/chapters/hooks/useChaptersQuery.ts';
import { novelKeys } from '@/features/novels/hooks/useNovelsQuery.ts';

export function useCreateChapterMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: CreateChapterBody) => createChapter(body),
        onSuccess: (chapter) => {
            void queryClient.invalidateQueries({ queryKey: chapterKeys.lists() });
            void queryClient.invalidateQueries({ queryKey: novelKeys.lists() });
            void queryClient.invalidateQueries({ queryKey: novelKeys.stats(chapter.novelId) });
        },
    });
}

export function useUpdateChapterMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, body }: { id: number; body: UpdateChapterBody }) => updateChapter(id, body),
        onSuccess: (chapter) => {
            void queryClient.invalidateQueries({ queryKey: chapterKeys.lists() });
            void queryClient.invalidateQueries({ queryKey: chapterKeys.detail(chapter.id) });
            void queryClient.invalidateQueries({ queryKey: novelKeys.lists() });
            void queryClient.invalidateQueries({ queryKey: novelKeys.stats(chapter.novelId) });
        },
    });
}

export function useDeleteChapterMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id }: { id: number; novelId: number }) => deleteChapter(id),
        onSuccess: (_data, variables) => {
            void queryClient.invalidateQueries({ queryKey: chapterKeys.lists() });
            void queryClient.removeQueries({ queryKey: chapterKeys.detail(variables.id) });
            void queryClient.invalidateQueries({ queryKey: novelKeys.lists() });
            void queryClient.invalidateQueries({ queryKey: novelKeys.stats(variables.novelId) });
        },
    });
}
