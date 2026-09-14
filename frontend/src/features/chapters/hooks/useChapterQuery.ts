import { useQuery } from '@tanstack/react-query';
import { getChapter } from '@/features/chapters/api/chaptersApi.ts';
import { chapterKeys } from '@/features/chapters/hooks/useChaptersQuery.ts';

export function useChapterQuery(id: number | undefined) {
    return useQuery({
        queryKey: chapterKeys.detail(id ?? 0),
        queryFn: () => getChapter(id!),
        enabled: Number.isFinite(id) && (id ?? 0) > 0,
    });
}
