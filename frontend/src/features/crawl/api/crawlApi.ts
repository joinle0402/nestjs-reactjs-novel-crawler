import { axiosClient } from '@/shared/api/axiosClient.ts';

export type CrawlScope = 'missing' | 'failed' | 'chapters';

export type CrawlJobStatus =
    | 'pending'
    | 'running'
    | 'paused'
    | 'waiting_for_manual_action'
    | 'completed'
    | 'completed_with_errors'
    | 'failed'
    | 'cancelled';

export type CrawlChapterStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export type CrawlJobProgress = {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    pending: number;
    currentChapterNumber: number | null;
    percent: number | null;
    detail: string;
};

export type CrawlJob = {
    id: number;
    novelId: number | null;
    novelTitle: string | null;
    url: string;
    scope: CrawlScope;
    chapterRange: string | null;
    chapterNumbers: number[] | null;
    status: CrawlJobStatus;
    errorMessage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
    createdAt: string;
    progress: CrawlJobProgress;
};

export type CrawlJobList = {
    items: CrawlJob[];
    total: number;
};

export type CrawlJobChapter = {
    id: number;
    chapterNumber: number;
    chapterId: number | null;
    title: string | null;
    status: CrawlChapterStatus;
    attemptCount: number;
    errorMessage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
};

export type CrawlLookup = {
    url: string;
    novelId: number | null;
    title: string | null;
    total: number;
    missing: number;
    failed: number;
};

export type CreateCrawlJobBody = {
    url?: string;
    novelId?: number;
    scope: CrawlScope;
    chapterRange?: string;
};

export const CRAWL_STATUS_LABEL: Record<CrawlJobStatus, string> = {
    pending: 'Chờ',
    running: 'Đang chạy',
    paused: 'Tạm dừng',
    waiting_for_manual_action: 'Chờ thao tác',
    completed: 'Hoàn thành',
    completed_with_errors: 'Xong, có lỗi',
    failed: 'Lỗi',
    cancelled: 'Đã hủy',
};

const ACTIVE: CrawlJobStatus[] = ['pending', 'running', 'paused', 'waiting_for_manual_action'];

export function isActiveCrawlJob(job: CrawlJob | null | undefined): boolean {
    return !!job && ACTIVE.includes(job.status);
}

export const lookupCrawlUrl = (url: string) => axiosClient.get<CrawlLookup>('/crawl/lookup', { params: { url } });

export const listCrawlJobs = (params: { status?: CrawlJobStatus; novelId?: number; page?: number; limit?: number }) =>
    axiosClient.get<CrawlJobList>('/crawl/jobs', { params });

export const getCrawlJob = (id: number) => axiosClient.get<CrawlJob>(`/crawl/jobs/${id}`);

export const getCrawlJobChapters = (id: number, status?: CrawlChapterStatus) =>
    axiosClient.get<CrawlJobChapter[]>(`/crawl/jobs/${id}/chapters`, { params: status ? { status } : {} });

export const getCurrentCrawlJob = () => axiosClient.get<CrawlJob | null>('/crawl/jobs/current');

export const createCrawlJob = (body: CreateCrawlJobBody) => axiosClient.post<CrawlJob>('/crawl/jobs', body);

export const pauseCrawlJob = (id: number) => axiosClient.post<CrawlJob>(`/crawl/jobs/${id}/pause`);

export const resumeCrawlJob = (id: number) => axiosClient.post<CrawlJob>(`/crawl/jobs/${id}/resume`);

export const continueCrawlJob = (id: number) => axiosClient.post<CrawlJob>(`/crawl/jobs/${id}/continue`);

export const cancelCrawlJob = (id: number) => axiosClient.post<CrawlJob>(`/crawl/jobs/${id}/cancel`);

export const retryCrawlJob = (id: number) => axiosClient.post<CrawlJob>(`/crawl/jobs/${id}/retry`);
