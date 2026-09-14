import { axiosClient } from '@/shared/api/axiosClient.ts';

export type NovelStatsCounts = {
    total: number;
    crawled: number;
    ttsDone: number;
    crawlFailed: number;
    ttsFailed: number;
};

export type NovelListItem = {
    id: number;
    url: string;
    title: string;
    author: string | null;
    summary: string | null;
    createdAt: string;
    stats: NovelStatsCounts;
};

export type Novel = {
    id: number;
    url: string;
    title: string;
    author: string | null;
    summary: string | null;
    createdAt: string;
};

export type NovelStats = NovelStatsCounts & {
    novelId: number;
    title: string;
};

export const getNovels = () => axiosClient.get<NovelListItem[]>('/novels');

export const getNovel = (id: number) => axiosClient.get<Novel>(`/novels/${id}`);

export const getNovelStats = (id: number) => axiosClient.get<NovelStats>(`/novels/${id}/stats`);
