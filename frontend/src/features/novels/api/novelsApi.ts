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

export type PlaybackState = {
    novelId: number;
    chapterNumber: number;
    positionSec: number;
    updatedAt: string;
};

export type CreateNovelBody = {
    url: string;
    title: string;
    author?: string;
    summary?: string;
};

export type UpdateNovelBody = Partial<CreateNovelBody>;

export const getNovels = () => axiosClient.get<NovelListItem[]>('/novels');

export const getNovel = (id: number) => axiosClient.get<Novel>(`/novels/${id}`);

export const getNovelStats = (id: number) => axiosClient.get<NovelStats>(`/novels/${id}/stats`);

export const createNovel = (body: CreateNovelBody) => axiosClient.post<Novel>('/novels', body);

export const updateNovel = (id: number, body: UpdateNovelBody) => axiosClient.put<Novel>(`/novels/${id}`, body);

export const deleteNovel = (id: number) => axiosClient.delete<void>(`/novels/${id}`);

export const getPlayback = (novelId: number) =>
    axiosClient.get<PlaybackState | null>(`/novels/${novelId}/playback`);

export const upsertPlayback = (novelId: number, body: { chapterNumber: number; positionSec: number }) =>
    axiosClient.put<PlaybackState>(`/novels/${novelId}/playback`, body);