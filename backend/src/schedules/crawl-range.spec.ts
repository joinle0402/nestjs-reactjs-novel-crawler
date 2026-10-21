import { parseChapterRange } from 'src/tts/chapter-range';
import { formatCrawlChapterRange } from './crawl-range';

/** Lấy đúng các chương mà worker sẽ cào từ `chapterRange` đã tạo. */
function parseToNumbers(range: string): number[] {
    const parsed = parseChapterRange(range);
    if (parsed.kind === 'all') {
        throw new Error('Schedules không được tạo range "all"');
    }
    return parsed.numbers;
}

describe('formatCrawlChapterRange', () => {
    it('chương đơn không bị hiểu thành 1..N', () => {
        const range = formatCrawlChapterRange([101]);
        expect(range).toBe('101-101');
        expect(parseToNumbers(range)).toEqual([101]);
    });

    it('nhiều chương rời được parse đúng từng số', () => {
        const range = formatCrawlChapterRange([101, 103]);
        expect(parseToNumbers(range)).toEqual([101, 103]);
    });

    it('dải liên tiếp giữ nguyên', () => {
        const range = formatCrawlChapterRange([101, 102, 103, 105]);
        expect(range).toBe('101-103,105');
        expect(parseToNumbers(range)).toEqual([101, 102, 103, 105]);
    });

    it('sắp xếp và bỏ trùng', () => {
        const range = formatCrawlChapterRange([5, 4, 5]);
        expect(range).toBe('4-5');
        expect(parseToNumbers(range)).toEqual([4, 5]);
    });

    it('danh sách rỗng trả chuỗi rỗng', () => {
        expect(formatCrawlChapterRange([])).toBe('');
    });
});
