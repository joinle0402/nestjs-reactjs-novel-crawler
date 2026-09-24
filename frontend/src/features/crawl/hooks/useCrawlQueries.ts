import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { message } from 'antd';
import {
    cancelCrawlJob,
    continueCrawlJob,
    createCrawlJob,
    getCrawlJob,
    getCrawlJobChapters,
    getCurrentCrawlJob,
    isActiveCrawlJob,
    listCrawlJobs,
    lookupCrawlUrl,
    pauseCrawlJob,
    resumeCrawlJob,
    retryCrawlJob,
    type CrawlChapterStatus,
    type CrawlJobStatus,
    type CreateCrawlJobBody,
} from '@/features/crawl/api/crawlApi.ts';
import { chapterKeys } from '@/features/chapters/hooks/useChaptersQuery.ts';
import { novelKeys } from '@/features/novels/hooks/useNovelsQuery.ts';

export const crawlKeys = {
    all: ['crawl'] as const,
    current: ['crawl', 'current'] as const,
    lookup: (url: string) => ['crawl', 'lookup', url] as const,
    list: (status: string, page: number) => ['crawl', 'jobs', status, page] as const,
    job: (id: number) => ['crawl', 'job', id] as const,
    chapters: (id: number, status: string) => ['crawl', 'chapters', id, status] as const,
};

const POLL_MS = 3000;

function useInvalidateCrawl() {
    const queryClient = useQueryClient();
    return (jobId?: number) => {
        void queryClient.invalidateQueries({ queryKey: crawlKeys.all });
        void queryClient.invalidateQueries({ queryKey: novelKeys.all });
        void queryClient.invalidateQueries({ queryKey: chapterKeys.lists() });
        if (jobId) {
            void queryClient.invalidateQueries({ queryKey: crawlKeys.job(jobId) });
        }
    };
}

export function useCurrentCrawlJobQuery() {
    return useQuery({
        queryKey: crawlKeys.current,
        queryFn: getCurrentCrawlJob,
        staleTime: 0,
        refetchInterval: (query) => (isActiveCrawlJob(query.state.data) ? POLL_MS : false),
    });
}

export function useCrawlJobWatch() {
    const queryClient = useQueryClient();
    const query = useCurrentCrawlJobQuery();
    const wasActive = useRef(false);
    const toasted = useRef('');

    useEffect(() => {
        const job = query.data;
        const active = isActiveCrawlJob(job);
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
            message.error(job.errorMessage || 'Cào truyện thất bại');
        } else if (job.status === 'completed') {
            message.success('Đã cào xong');
        } else if (job.status === 'completed_with_errors') {
            message.warning(job.errorMessage || 'Cào xong, còn chương lỗi');
        } else if (job.status === 'cancelled') {
            message.info('Đã hủy job cào');
        }
        void queryClient.invalidateQueries({ queryKey: chapterKeys.lists() });
        void queryClient.invalidateQueries({ queryKey: novelKeys.all });
        void queryClient.invalidateQueries({ queryKey: crawlKeys.all });
    }, [query.data, queryClient]);

    return query;
}

export function useCrawlLookupQuery(url: string) {
    const trimmed = url.trim();
    return useQuery({
        queryKey: crawlKeys.lookup(trimmed),
        queryFn: () => lookupCrawlUrl(trimmed),
        enabled: trimmed.includes('sangtacviet.com/truyen/'),
        retry: false,
    });
}

export function useCrawlJobsQuery(status: CrawlJobStatus | '', page: number) {
    return useQuery({
        queryKey: crawlKeys.list(status, page),
        queryFn: () => listCrawlJobs({ status: status || undefined, page, limit: 20 }),
    });
}

export function useCrawlJobQuery(id: number | null) {
    return useQuery({
        queryKey: crawlKeys.job(id ?? 0),
        queryFn: () => getCrawlJob(id!),
        enabled: !!id,
        refetchInterval: (query) => (isActiveCrawlJob(query.state.data) ? POLL_MS : false),
    });
}

export function useCrawlChaptersQuery(id: number | null, status: CrawlChapterStatus | '', active: boolean) {
    return useQuery({
        queryKey: crawlKeys.chapters(id ?? 0, status),
        queryFn: () => getCrawlJobChapters(id!, status || undefined),
        enabled: !!id,
        refetchInterval: active ? POLL_MS : false,
    });
}

export function useCreateCrawlJobMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (body: CreateCrawlJobBody) => createCrawlJob(body),
        onSuccess: (job) => {
            queryClient.setQueryData(crawlKeys.current, job);
            void queryClient.invalidateQueries({ queryKey: crawlKeys.all });
        },
    });
}

export function useCrawlActionMutation(action: 'pause' | 'resume' | 'continue' | 'cancel' | 'retry') {
    const invalidate = useInvalidateCrawl();
    const queryClient = useQueryClient();
    const fn = {
        pause: pauseCrawlJob,
        resume: resumeCrawlJob,
        continue: continueCrawlJob,
        cancel: cancelCrawlJob,
        retry: retryCrawlJob,
    }[action];
    return useMutation({
        mutationFn: (id: number) => fn(id),
        onSuccess: (job) => {
            queryClient.setQueryData(crawlKeys.current, job);
            invalidate(job.id);
        },
    });
}
