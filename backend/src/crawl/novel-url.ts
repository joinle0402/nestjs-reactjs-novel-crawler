export class NovelUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NovelUrlError';
    }
}

const NOVEL_URL = /^https?:\/\/[^/]+\/truyen\/[^/]+\/[^/]+\/\d+\/$/;

export function normalizeNovelUrl(url: string): string {
    const trimmed = url.trim();
    if (!trimmed) {
        throw new NovelUrlError('Nhập URL truyện');
    }
    const withSlash = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
    if (!withSlash.includes('sangtacviet.com') || !NOVEL_URL.test(withSlash)) {
        throw new NovelUrlError('URL phải là https://sangtacviet.com/truyen/{nguồn}/{id}/');
    }
    return withSlash;
}
