export class NovelUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NovelUrlError';
    }
}

const NOVEL_URL = /^https?:\/\/[^/]+\/truyen\/[^/]+\/[^/]+\/\d+\/$/;
const NOVEL_SOURCE = /^https?:\/\/[^/]+\/truyen\/([^/]+)\/[^/]+\/(\d+)\/?/;

export type NovelSource = {
    /** Nguồn truyện (h) trên sangtacviet, ví dụ `qimao`. */
    source: string;
    /** ID truyện trên trang nguồn (bookid). */
    bookId: string;
};

export function parseNovelSource(url: string): NovelSource {
    const match = NOVEL_SOURCE.exec(url.trim());
    if (!match) {
        throw new NovelUrlError('URL truyện không hợp lệ để đồng bộ chương');
    }
    return { source: match[1], bookId: match[2] };
}

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
