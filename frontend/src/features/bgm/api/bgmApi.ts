import { axiosClient } from '@/shared/api/axiosClient.ts';

export type BgmTrack = {
    id: string;
    name: string;
    fileName: string;
    createdAt: string;
};

export const listBgmTracks = () => axiosClient.get<BgmTrack[]>('/bgm');

export const createBgmTrack = (body: FormData) => axiosClient.post<BgmTrack>('/bgm', body);

export const deleteBgmTrack = (id: string) => axiosClient.delete<void>(`/bgm/${id}`);

export function getBgmAudioUrl(id: string): string {
    const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';
    return `${base.replace(/\/$/, '')}/bgm/${id}/audio`;
}
