import { useQuery } from '@tanstack/react-query';
import { getNovel } from '@/features/novels/api/novelsApi.ts';
import { novelKeys } from '@/features/novels/hooks/useNovelsQuery.ts';

export function useNovelQuery(id: number | undefined) {
    return useQuery({
        queryKey: novelKeys.detail(id ?? 0),
        queryFn: () => getNovel(id!),
        enabled: Number.isFinite(id) && (id ?? 0) > 0,
    });
}
