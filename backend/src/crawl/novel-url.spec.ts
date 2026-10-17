import { NovelUrlError, normalizeNovelUrl, parseNovelSource } from './novel-url';

describe('normalizeNovelUrl', () => {
    it('adds a trailing slash and accepts sangtacviet novel urls', () => {
        expect(normalizeNovelUrl('https://sangtacviet.com/truyen/qidian/1/12345')).toBe(
            'https://sangtacviet.com/truyen/qidian/1/12345/',
        );
    });

    it('rejects other sites and incomplete paths', () => {
        expect(() => normalizeNovelUrl('https://example.com/truyen/qidian/1/12345/')).toThrow(NovelUrlError);
        expect(() => normalizeNovelUrl('https://sangtacviet.com/truyen/qidian/')).toThrow(NovelUrlError);
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
