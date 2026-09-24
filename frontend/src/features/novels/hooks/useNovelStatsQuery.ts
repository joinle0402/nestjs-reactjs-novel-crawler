import { useQuery } from '@tanstack/react-query';
import { getNovelStats } from '@/features/novels/api/novelsApi.ts';
import { novelKeys } from '@/features/novels/hooks/useNovelsQuery.ts';

export function useNovelStatsQuery(id: number | undefined, extras?: { refetchInterval?: number | false }) {
    return useQuery({
        queryKey: novelKeys.stats(id ?? 0),
        queryFn: () => getNovelStats(id!),
        enabled: Number.isFinite(id) && (id ?? 0) > 0,
        refetchInterval: extras?.refetchInterval,
    });
}
