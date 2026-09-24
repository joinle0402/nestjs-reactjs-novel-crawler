/**
 * Cùng quy tắc với worker/chapter_range.py.
 * Web preview/validate dùng bản này; worker khi chạy job parse lại bằng module Python.
 */

export class ChapterRangeParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ChapterRangeParseError';
    }
}

export type ChapterRange = { kind: 'all' } | { kind: 'numbers'; numbers: number[] };

export function formatChapterList(numbers: number[], dash: string, separator: string): string {
    const sorted = [...numbers].sort((a, b) => a - b);
    if (sorted.length === 0) {
        return '';
    }
    const parts: string[] = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (const n of sorted.slice(1)) {
        if (n === prev + 1) {
            prev = n;
            continue;
        }
        parts.push(start === prev ? String(start) : `${start}${dash}${prev}`);
        start = prev = n;
    }
    parts.push(start === prev ? String(start) : `${start}${dash}${prev}`);
    return parts.join(separator);
}

export function formatPreviewSentence(numbers: number[]): string {
    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    const label = sorted.length > 0 ? formatChapterList(sorted, '\u2013', ', ') : '(rỗng)';
    return `${label} (${sorted.length} chương, bỏ qua chương đã có MP3)`;
}

export function formatAllPreviewSentence(count: number): string {
    return `all (${count} chương, bỏ qua chương đã có MP3)`;
}

export function parseChapterRange(
    text: string,
    options?: { maxAvailable?: number | null; useDefaultOnEmpty?: boolean },
): ChapterRange {
    const useDefaultOnEmpty = options?.useDefaultOnEmpty ?? false;
    let raw = text.trim();
    if (!raw) {
        if (!useDefaultOnEmpty) {
            throw new ChapterRangeParseError('Phạm vi chương không được để trống.');
        }
        raw = 'all';
    }

    if (raw.toLowerCase() === 'all') {
        return { kind: 'all' };
    }

    const numbers = new Set<number>();
    const segments = raw
        .split(',')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
    if (segments.length === 0) {
        throw new ChapterRangeParseError(`Phạm vi không hợp lệ: ${JSON.stringify(text)}`);
    }

    for (const segment of segments) {
        if (/^\d+$/.test(segment)) {
            const n = Number(segment);
            if (n <= 0) {
                throw new ChapterRangeParseError(`Số chương phải > 0: ${segment}`);
            }
            if (!raw.includes(',') && !raw.includes('-') && segments.length === 1) {
                for (let i = 1; i <= n; i += 1) {
                    numbers.add(i);
                }
            } else {
                numbers.add(n);
            }
            continue;
        }

        const rangeMatch = /^(\d+)-(\d+)$/.exec(segment);
        if (!rangeMatch) {
            throw new ChapterRangeParseError(
                `Đoạn không hợp lệ: ${JSON.stringify(segment)}. Dùng: 10 | 5-10 | 1,2,3 | 1-3,6 | all`,
            );
        }
        const start = Number(rangeMatch[1]);
        const end = Number(rangeMatch[2]);
        if (start <= 0 || end <= 0) {
            throw new ChapterRangeParseError(`Số chương phải > 0: ${segment}`);
        }
        if (start > end) {
            throw new ChapterRangeParseError(`Range không hợp lệ (đầu > cuối): ${segment}`);
        }
        for (let i = start; i <= end; i += 1) {
            numbers.add(i);
        }
    }

    if (numbers.size === 0) {
        throw new ChapterRangeParseError(`Không có chương nào trong phạm vi: ${JSON.stringify(text)}`);
    }

    const maxAvailable = options?.maxAvailable;
    if (maxAvailable != null) {
        const outOfRange = [...numbers].filter((n) => n > maxAvailable).sort((a, b) => a - b);
        if (outOfRange.length > 0) {
            throw new ChapterRangeParseError(
                `Chương vượt quá số chương có sẵn (${maxAvailable}): ${formatChapterList(outOfRange, '-', ',')}`,
            );
        }
    }

    return { kind: 'numbers', numbers: [...numbers].sort((a, b) => a - b) };
}
