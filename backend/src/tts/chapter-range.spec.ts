import { ChapterRangeParseError, parseChapterRange, formatPreviewSentence } from './chapter-range';

describe('parseChapterRange', () => {
    it('parses the same forms as worker/chapter_range.py', () => {
        expect(parseChapterRange('10')).toEqual({ kind: 'numbers', numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] });
        expect(parseChapterRange('5-10')).toEqual({
            kind: 'numbers',
            numbers: [5, 6, 7, 8, 9, 10],
        });
        expect(parseChapterRange('1,2,3,6,8')).toEqual({ kind: 'numbers', numbers: [1, 2, 3, 6, 8] });
        expect(parseChapterRange('1-3,6,8')).toEqual({ kind: 'numbers', numbers: [1, 2, 3, 6, 8] });
        expect(parseChapterRange('1, 2, 5')).toEqual({ kind: 'numbers', numbers: [1, 2, 5] });
        expect(parseChapterRange('10-10')).toEqual({ kind: 'numbers', numbers: [10] });
        expect(parseChapterRange('1')).toEqual({ kind: 'numbers', numbers: [1] });
        expect(parseChapterRange('all')).toEqual({ kind: 'all' });
        expect(parseChapterRange('ALL')).toEqual({ kind: 'all' });
    });

    it('rejects empty, reversed, and out-of-range input', () => {
        expect(() => parseChapterRange('')).toThrow(ChapterRangeParseError);
        expect(() => parseChapterRange('0')).toThrow('Số chương phải > 0');
        expect(() => parseChapterRange('5-1')).toThrow('đầu > cuối');
        expect(() => parseChapterRange('1-3', { maxAvailable: 2 })).toThrow('vượt quá');
        expect(() => parseChapterRange('foo')).toThrow('Đoạn không hợp lệ');
    });

    it('formats the popup preview', () => {
        expect(formatPreviewSentence([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15])).toBe(
            '1\u201310, 15 (11 chương, bỏ qua chương đã có MP3)',
        );
    });
});
