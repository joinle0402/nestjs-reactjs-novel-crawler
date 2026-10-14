import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Select } from 'antd';

export const PAGE_LIMITS = [10, 20, 50, 100, 500] as const;
export const DEFAULT_PAGE_LIMIT = 20;
/** Giá trị gửi API khi người dùng chọn "Tất cả". URL ghi `limit=all`. */
export const ALL_PAGE_LIMIT = 10_000;
const PAGE_WINDOW = 10;

const LIMIT_OPTIONS = [
    ...PAGE_LIMITS.map((limit) => ({ value: limit, label: String(limit) })),
    { value: ALL_PAGE_LIMIT, label: 'Tất cả' },
];

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

export function isLargePageLimit(limit: number): boolean {
    return limit >= 100;
}

export function tableScroll(x: number | undefined, limit: number): { x?: number; y?: string } | undefined {
    const y = isLargePageLimit(limit) ? 'calc(100vh - 420px)' : undefined;
    if (x == null && y == null) {
        return undefined;
    }
    return {
        ...(x != null ? { x } : {}),
        ...(y != null ? { y } : {}),
    };
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

export function ListPagination({
    current,
    pageSize,
    total,
    totalLabel,
    onChange,
}: {
    current: number;
    pageSize: number;
    total: number;
    totalLabel: (total: number) => string;
    onChange: (page: number, pageSize: number) => void;
}) {
    const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
    const safeCurrent = Math.min(Math.max(1, current), totalPages);
    const pages = visiblePages(safeCurrent, totalPages);

    return (
        <div className="list-pagination">
            <span className="list-pagination__total">{totalLabel(total)}</span>
            <Select
                size="small"
                aria-label="Số dòng mỗi trang"
                value={pageSize}
                options={LIMIT_OPTIONS}
                style={{ width: 100 }}
                onChange={(next: number) => onChange(1, next)}
            />
            <div className="list-pagination__pages">
                <Button
                    size="small"
                    icon={<LeftOutlined />}
                    disabled={safeCurrent <= 1}
                    aria-label="Trang trước"
                    onClick={() => onChange(safeCurrent - 1, pageSize)}
                />
                {pages.map((item, index) =>
                    item === 'ellipsis' ? (
                        <span key={`ellipsis-${index}`} className="list-pagination__ellipsis" aria-hidden>
                            …
                        </span>
                    ) : (
                        <Button
                            key={item}
                            size="small"
                            type={item === safeCurrent ? 'primary' : 'default'}
                            aria-label={`Trang ${item}`}
                            aria-current={item === safeCurrent ? 'page' : undefined}
                            onClick={() => onChange(item, pageSize)}
                        >
                            {item}
                        </Button>
                    ),
                )}
                <Button
                    size="small"
                    icon={<RightOutlined />}
                    disabled={safeCurrent >= totalPages}
                    aria-label="Trang sau"
                    onClick={() => onChange(safeCurrent + 1, pageSize)}
                />
            </div>
        </div>
    );
}
