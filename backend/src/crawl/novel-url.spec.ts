import { NovelUrlError, normalizeNovelUrl } from './novel-url';

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
