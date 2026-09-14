import { axiosClient } from '@/shared/api/axiosClient.ts';
import type { JobStatus } from '@/shared/types/jobStatus.ts';

export type ChapterListItem = {
    id: number;
    novelId: number;
    chapterSiteId: string;
    chapterNumber: number;
    title: string;
    crawlStatus: JobStatus;
    ttsStatus: JobStatus;
    mp3Path: string | null;
    hasMp3: boolean;
    ttsCharsTotal: number;
    ttsCharsDone: number;
};

export type ChapterNeighbor = {
    id: number;
    chapterNumber: number;
    title: string;
};

export type ChapterDetail = {
    id: number;
    novelId: number;
    chapterSiteId: string;
    chapterNumber: number;
    title: string;
    content: string | null;
    mp3Path: string | null;
    hasMp3: boolean;
    crawledAt: string;
    crawlStatus: JobStatus;
    ttsStatus: JobStatus;
    ttsCharsTotal: number;
    ttsCharsDone: number;
    createdAt: string;
    updatedAt: string;
    prev: ChapterNeighbor | null;
    next: ChapterNeighbor | null;
};

export type PaginationMeta = {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

export type PaginatedChapters = {
    data: ChapterListItem[];
    meta: PaginationMeta;
};

export type ListChaptersParams = {
    page?: number;
    limit?: number;
    crawlStatus?: JobStatus;
    ttsStatus?: JobStatus;
    hasMp3?: boolean;
};

export const getChaptersByNovel = (novelId: number, params: ListChaptersParams = {}) =>
    axiosClient.get<PaginatedChapters>(`/chapters/novel/${novelId}`, { params });

export const getChapter = (id: number) => axiosClient.get<ChapterDetail>(`/chapters/${id}`);
