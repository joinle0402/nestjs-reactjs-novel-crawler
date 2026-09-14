import { useQuery } from '@tanstack/react-query';
import { getNovels } from '@/features/novels/api/novelsApi.ts';

export const novelKeys = {
    all: ['novels'] as const,
    lists: () => [...novelKeys.all, 'list'] as const,
    details: () => [...novelKeys.all, 'detail'] as const,
    detail: (id: number) => [...novelKeys.details(), id] as const,
    stats: (id: number) => [...novelKeys.detail(id), 'stats'] as const,
};

export function useNovelsQuery() {
    return useQuery({
        queryKey: novelKeys.lists(),
        queryFn: getNovels,
    });
}
