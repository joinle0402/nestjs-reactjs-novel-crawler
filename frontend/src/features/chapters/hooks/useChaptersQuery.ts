import { useQuery } from '@tanstack/react-query';
import { getChaptersByNovel, type ListChaptersParams } from '@/features/chapters/api/chaptersApi.ts';

export const chapterKeys = {
    all: ['chapters'] as const,
    lists: () => [...chapterKeys.all, 'list'] as const,
    list: (novelId: number, params: ListChaptersParams) => [...chapterKeys.lists(), novelId, params] as const,
    details: () => [...chapterKeys.all, 'detail'] as const,
    detail: (id: number) => [...chapterKeys.details(), id] as const,
};

export function useChaptersQuery(
    novelId: number | undefined,
    params: ListChaptersParams,
    extras?: { refetchInterval?: number | false },
) {
    return useQuery({
        queryKey: chapterKeys.list(novelId ?? 0, params),
        queryFn: () => getChaptersByNovel(novelId!, params),
        enabled: Number.isFinite(novelId) && (novelId ?? 0) > 0,
        placeholderData: (previous) => previous,
        refetchInterval: extras?.refetchInterval,
    });
}
