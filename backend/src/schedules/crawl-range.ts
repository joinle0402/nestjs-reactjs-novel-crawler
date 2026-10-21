import { formatChapterList } from 'src/tts/chapter-range';

/**
 * Định dạng danh sách chương mới thành `chapterRange` cho job cào.
 *
 * `parseChapterRange` hiểu một số đơn lẻ là "1..N", nên chương đơn phải ghi dạng `N-N`.
 * Nhiều chương đã có dấu `,` hoặc `-` thì parse đúng từng số.
 */
export function formatCrawlChapterRange(numbers: number[]): string {
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    if (sorted.length === 0) {
        return '';
    }
    if (sorted.length === 1) {
        return `${sorted[0]}-${sorted[0]}`;
    }
    return formatChapterList(sorted, '-', ',');
}
