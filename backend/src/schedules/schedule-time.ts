const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 0 = Chủ nhật, 1 = Thứ 2 … 6 = Thứ 7. */
export function normalizeDaysOfWeek(value: readonly number[] | null | undefined): number[] {
    const unique = new Set((value ?? []).map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6));
    return [...unique].sort((left, right) => left - right);
}

export function isValidTimeOfDay(value: string): boolean {
    return TIME_PATTERN.test(value);
}

/**
 * Lần chạy kế tiếp theo ngày trong tuần + giờ trong ngày.
 * Trả null khi chưa chọn ngày hoặc giờ không hợp lệ.
 */
export function computeNextRun(daysOfWeek: readonly number[], timeOfDay: string, from: Date): Date | null {
    if (!isValidTimeOfDay(timeOfDay)) {
        return null;
    }
    const days = normalizeDaysOfWeek(daysOfWeek);
    if (days.length === 0) {
        return null;
    }
    const [hour, minute] = timeOfDay.split(':').map(Number);
    for (let offset = 0; offset <= 7; offset += 1) {
        const candidate = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offset, hour, minute, 0, 0);
        if (days.includes(candidate.getDay()) && candidate.getTime() > from.getTime()) {
            return candidate;
        }
    }
    return null;
}
