import { NovelUrlError, detectSourceKind, normalizeNovelUrl, parseNovelSource, sameNovelUrl } from './novel-url';

describe('normalizeNovelUrl', () => {
    it('adds a trailing slash and accepts sangtacviet novel urls', () => {
        expect(normalizeNovelUrl('https://sangtacviet.com/truyen/qidian/1/12345')).toBe('https://sangtacviet.com/truyen/qidian/1/12345/');
    });

    it('accepts wikicv novel urls and strips the fragment and trailing slash', () => {
        const url = 'https://wikicv.org/truyen/lich-su-phong-live-stream-tuy-co-sang-ch-aJWKhFS4CFLtYED4';
        expect(normalizeNovelUrl(`${url}#!`)).toBe(url);
        expect(normalizeNovelUrl(`${url}/`)).toBe(url);
    });

    it('rejects other sites and incomplete paths', () => {
        expect(() => normalizeNovelUrl('https://example.com/truyen/qidian/1/12345/')).toThrow(NovelUrlError);
        expect(() => normalizeNovelUrl('https://sangtacviet.com/truyen/qidian/')).toThrow(NovelUrlError);
        expect(() => normalizeNovelUrl('https://wikicv.org/truyen/')).toThrow(NovelUrlError);
    });
});

describe('detectSourceKind', () => {
    it('recognizes wikicv and defaults to sangtacviet', () => {
        expect(detectSourceKind('https://wikicv.org/truyen/abc-def-123')).toBe('wikicv');
        expect(detectSourceKind('https://www.wikicv.net/truyen/abc-def-123')).toBe('wikicv');
        expect(detectSourceKind('https://sangtacviet.com/truyen/qimao/1/9980688/')).toBe('sangtacviet');
    });
});

describe('sameNovelUrl', () => {
    it('treats slash and fragment variants as the same novel', () => {
        const wikicv = 'https://wikicv.org/truyen/lich-su-phong-live-stream-tuy-co-sang-ch-aJWKhFS4CFLtYED4';
        expect(sameNovelUrl(`${wikicv}/`, `${wikicv}#!`)).toBe(true);
        expect(sameNovelUrl('https://sangtacviet.com/truyen/qimao/1/9980688', 'https://sangtacviet.com/truyen/qimao/1/9980688/')).toBe(true);
    });

    it('keeps different sources apart', () => {
        expect(
            sameNovelUrl('https://sangtacviet.com/truyen/qimao/1/9980688/', 'https://wikicv.org/truyen/abc-def-123'),
        ).toBe(false);
    });
});

describe('parseNovelSource', () => {
    it('extracts the source and book id from a novel url', () => {
        expect(parseNovelSource('https://sangtacviet.com/truyen/qimao/1/9980688/')).toEqual({
            source: 'qimao',
            bookId: '9980688',
        });
    });

    it('accepts a url without a trailing slash', () => {
        expect(parseNovelSource('https://sangtacviet.com/truyen/qimao/1/9980688')).toEqual({
            source: 'qimao',
            bookId: '9980688',
        });
    });

    it('throws for an unparsable url', () => {
        expect(() => parseNovelSource('https://sangtacviet.com/truyen/qimao/')).toThrow(NovelUrlError);
    });
});
