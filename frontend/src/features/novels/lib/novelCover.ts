export const DEFAULT_NOVEL_COVER = '/novel-default-cover.svg';

type CoverSource = {
    id: number;
    coverImage?: string | null;
};

/** Ảnh upload nội bộ và ảnh nguồn đều đi qua endpoint backend để tránh hotlink. */
export function getNovelCoverUrl(novel: CoverSource): string {
    const cover = novel.coverImage?.trim();
    if (!cover) {
        return DEFAULT_NOVEL_COVER;
    }
    const base = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api/v1';
    return `${base.replace(/\/$/, '')}/novels/${novel.id}/cover?v=${encodeURIComponent(cover)}`;
}
