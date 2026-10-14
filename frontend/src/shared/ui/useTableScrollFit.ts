import { useCallback, useEffect, useState } from 'react';

/** Độ cao tối thiểu của thân bảng khi màn hình quá thấp. */
const MIN_BODY_HEIGHT = 160;

function bottomPaddingOf(element: Element | null): number {
    if (!element) {
        return 0;
    }
    return parseFloat(window.getComputedStyle(element).paddingBottom) || 0;
}

/** Ghép props `scroll` cho antd Table từ chiều cao thân bảng đã đo. */
export function fitTableScroll(
    x: number | undefined,
    bodyHeight: number | undefined,
): { x?: number; y?: number } | undefined {
    if (x == null && bodyHeight == null) {
        return undefined;
    }
    return {
        ...(x != null ? { x } : {}),
        ...(bodyHeight != null ? { y: bodyHeight } : {}),
    };
}

/**
 * Đo chiều cao còn lại của viewport để set `scroll.y` cho antd Table sao cho
 * bảng + phân trang vừa khít màn hình: nhiều dòng thì thân bảng cuộn (scrollY),
 * ít dòng thì bảng co gọn như bình thường (antd áp scroll.y dưới dạng max-height).
 * Nhờ đo trực tiếp vị trí bảng, hàng filter, khối phân trang và player nổi dưới
 * đáy, không cần số cứng `calc(100vh - Npx)` riêng cho từng trang.
 *
 * Cách dùng: gắn `areaRef` vào div bao Table + ListPagination, rồi truyền
 * `scroll={fitTableScroll(x, bodyHeight)}` vào Table.
 */
export function useTableScrollFit() {
    const [areaEl, setAreaEl] = useState<HTMLDivElement | null>(null);
    const [bodyHeight, setBodyHeight] = useState<number>();

    useEffect(() => {
        if (!areaEl) {
            return;
        }
        let frame = 0;

        const measure = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const table = areaEl.querySelector<HTMLElement>('.ant-table');
                if (!table) {
                    return;
                }
                const header = table.querySelector<HTMLElement>('.ant-table-thead');
                const pagination = areaEl.querySelector<HTMLElement>('.list-pagination');

                // Khoảng chừa dưới đáy: padding Content (đã gồm player nổi dưới đáy)
                // + padding thân card bao ngoài + cả khối phân trang (kể cả margin trên).
                const paginationBlock = pagination
                    ? pagination.offsetHeight + (parseFloat(window.getComputedStyle(pagination).marginTop) || 0)
                    : 0;
                const reserved =
                    bottomPaddingOf(areaEl.closest('.ant-layout-content')) +
                    bottomPaddingOf(areaEl.closest('.ant-card-body')) +
                    paginationBlock;

                // Quy đổi về hệ tọa độ tài liệu để không phụ thuộc vị trí cuộn hiện tại.
                const scrollOffset = window.scrollY;
                const headerTop = table.getBoundingClientRect().top + scrollOffset;
                const next = scrollOffset + window.innerHeight - reserved - headerTop - (header?.offsetHeight ?? 0);
                setBodyHeight(Math.max(MIN_BODY_HEIGHT, Math.floor(next)));
            });
        };

        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(areaEl);
        observer.observe(document.body);
        window.addEventListener('resize', measure);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [areaEl]);

    const areaRef = useCallback((element: HTMLDivElement | null) => setAreaEl(element), []);

    return { areaRef, bodyHeight };
}
