import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Button, Select } from 'antd';
import { ALL_PAGE_LIMIT, PAGE_LIMITS, visiblePages } from '@/shared/ui/listPagination.ts';

const LIMIT_OPTIONS = [
    ...PAGE_LIMITS.map((limit) => ({ value: limit, label: String(limit) })),
    { value: ALL_PAGE_LIMIT, label: 'Tất cả' },
];

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
