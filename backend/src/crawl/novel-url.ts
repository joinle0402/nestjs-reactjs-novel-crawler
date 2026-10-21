export class NovelUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NovelUrlError';
    }
}

const NOVEL_URL = /^https?:\/\/[^/]+\/truyen\/[^/]+\/[^/]+\/\d+\/$/;
const NOVEL_SOURCE = /^https?:\/\/[^/]+\/truyen\/([^/]+)\/[^/]+\/(\d+)\/?/;

/** Nguồn truyện được hỗ trợ. */
export type NovelSourceKind = 'sangtacviet' | 'wikicv';

const WIKICV_NOVEL_URL = /^https?:\/\/(?:[^/]*\.)?wikicv\.(?:org|net)\/truyen\/[^/?#]+\/?$/i;

export type NovelSource = {
    /** Nguồn truyện (h) trên sangtacviet, ví dụ `qimao`. */
    source: string;
    /** ID truyện trên trang nguồn (bookid). */
    bookId: string;
};

export function detectSourceKind(url: string): NovelSourceKind {
    return WIKICV_NOVEL_URL.test(url.trim()) ? 'wikicv' : 'sangtacviet';
}

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
    // wikicv dùng fragment `#!` để điều hướng; bỏ trước khi so khớp.
    const withoutFragment = trimmed.split('#')[0].trim();
    if (WIKICV_NOVEL_URL.test(withoutFragment)) {
        return withoutFragment.replace(/\/+$/, '');
    }
    const withSlash = withoutFragment.endsWith('/') ? withoutFragment : `${withoutFragment}/`;
    if (!withSlash.includes('sangtacviet.com') || !NOVEL_URL.test(withSlash)) {
        throw new NovelUrlError('URL phải là https://sangtacviet.com/truyen/{nguồn}/{id}/ hoặc https://wikicv.org/truyen/{slug}');
    }
    return withSlash;
}

/** So sánh URL truyện sau khi chuẩn hoá; URL không thuộc nguồn hỗ trợ thì so sánh nguyên văn. */
export function sameNovelUrl(left: string, right: string): boolean {
    try {
        return normalizeNovelUrl(left) === normalizeNovelUrl(right);
    } catch {
        return left.trim() === right.trim();
    }
}
