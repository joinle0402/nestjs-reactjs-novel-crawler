/** Chuỗi đưa vào ô phạm vi. Một số đơn > 1 phải là `n-n` vì console hiểu `10` là chương 1–10. */
export function formatChapterRangeInput(numbers: number[]): string {
    const sorted = [...new Set(numbers.filter((n) => Number.isInteger(n) && n > 0))].sort((a, b) => a - b);
    if (sorted.length === 0) {
        return '';
    }
    if (sorted.length === 1) {
        return sorted[0] === 1 ? '1' : `${sorted[0]}-${sorted[0]}`;
    }
    const parts: string[] = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (const n of sorted.slice(1)) {
        if (n === prev + 1) {
            prev = n;
            continue;
        }
        parts.push(start === prev ? String(start) : `${start}-${prev}`);
        start = prev = n;
    }
    parts.push(start === prev ? String(start) : `${start}-${prev}`);
    return parts.join(',');
}
