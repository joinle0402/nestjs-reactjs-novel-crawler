const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

export function formatRelativeTime(value: string | number | Date, now: Date = new Date()): string {
    const date = value instanceof Date ? value : new Date(value);
    const diffMs = now.getTime() - date.getTime();
    if (Number.isNaN(diffMs) || diffMs < MINUTE * 1000) {
        return 'vừa xong';
    }

    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < HOUR) {
        return `${Math.floor(diffSec / MINUTE)} phút trước`;
    }
    if (diffSec < DAY) {
        return `${Math.floor(diffSec / HOUR)} giờ trước`;
    }
    if (diffSec < MONTH) {
        return `${Math.floor(diffSec / DAY)} ngày trước`;
    }
    if (diffSec < YEAR) {
        return `${Math.floor(diffSec / MONTH)} tháng trước`;
    }
    return `${Math.floor(diffSec / YEAR)} năm trước`;
}

export function formatDateTime(value: string | number | Date): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return '';
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    const datePart = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
    const timePart = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    return `${datePart} ${timePart}`;
}
