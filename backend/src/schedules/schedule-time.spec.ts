import { computeNextRun, normalizeDaysOfWeek } from './schedule-time';

describe('schedule-time', () => {
    // 19/10/2026 là Thứ 2.
    const mondayMorning = new Date(2026, 9, 19, 10, 0, 0);

    it('normalizes and sorts days, dropping invalid values', () => {
        expect(normalizeDaysOfWeek([3, 1, 3, 7, -1, 0])).toEqual([0, 1, 3]);
    });

    it('picks the same day when the time is still ahead', () => {
        const next = computeNextRun([1], '12:30', mondayMorning);
        expect(next).not.toBeNull();
        expect(next!.getDay()).toBe(1);
        expect(next!.getDate()).toBe(19);
        expect(next!.getHours()).toBe(12);
        expect(next!.getMinutes()).toBe(30);
    });

    it('rolls to the next week when today already passed', () => {
        const next = computeNextRun([1], '08:00', mondayMorning);
        expect(next).not.toBeNull();
        expect(next!.getDay()).toBe(1);
        expect(next!.getDate()).toBe(26);
    });

    it('finds the next selected day', () => {
        const next = computeNextRun([3, 5], '09:00', mondayMorning);
        expect(next).not.toBeNull();
        expect(next!.getDay()).toBe(3);
        expect(next!.getDate()).toBe(21);
    });

    it('returns null without days or with an invalid time', () => {
        expect(computeNextRun([], '08:00', mondayMorning)).toBeNull();
        expect(computeNextRun([1], '25:00', mondayMorning)).toBeNull();
    });
});
