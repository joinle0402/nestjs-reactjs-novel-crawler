export const PAGE_LIMITS = [10, 20, 50, 100, 500] as const;
export const DEFAULT_PAGE_LIMIT = 20;
/** Giá trị gửi API khi người dùng chọn "Tất cả". URL ghi `limit=all`. */
export const ALL_PAGE_LIMIT = 10_000;
const PAGE_WINDOW = 20;

export function parsePageLimit(value: string | null | undefined): number {
    if (value === 'all') {
        return ALL_PAGE_LIMIT;
    }
    const parsed = Number(value);
    if ((PAGE_LIMITS as readonly number[]).includes(parsed)) {
        return parsed;
    }
    return DEFAULT_PAGE_LIMIT;
}

/** `undefined` nghĩa là mặc định (10) — bỏ query `limit`. */
export function pageLimitParam(limit: number): string | undefined {
    if (limit === ALL_PAGE_LIMIT) {
        return 'all';
    }
    if (limit === DEFAULT_PAGE_LIMIT) {
        return undefined;
    }
    return String(limit);
}

export function isRowActionTarget(target: EventTarget | null): boolean {
    return (
        target instanceof HTMLElement &&
        Boolean(target.closest('a, button, .ant-checkbox, .ant-checkbox-wrapper, .ant-table-selection-column'))
    );
}

export function visiblePages(current: number, totalPages: number, windowSize = PAGE_WINDOW): Array<number | 'ellipsis'> {
    const pages = Math.max(1, totalPages);
    const safeCurrent = Math.min(Math.max(1, current), pages);
    if (pages <= windowSize) {
        return Array.from({ length: pages }, (_, index) => index + 1);
    }

    let start = Math.max(1, safeCurrent - Math.floor((windowSize - 1) / 2));
    let end = start + windowSize - 1;
    if (end > pages) {
        end = pages;
        start = end - windowSize + 1;
    }

    const items: Array<number | 'ellipsis'> = [];
    if (start > 1) {
        items.push(1);
        if (start > 2) {
            items.push('ellipsis');
        }
    }
    for (let page = start; page <= end; page += 1) {
        items.push(page);
    }
    if (end < pages) {
        if (end < pages - 1) {
            items.push('ellipsis');
        }
        items.push(pages);
    }
    return items;
}
