import { axiosClient } from '@/shared/api/axiosClient.ts';

export type ScheduleRunStage = 'idle' | 'sync' | 'crawl' | 'tts' | 'drive';
export type ScheduleLastStatus = 'running' | 'completed' | 'skipped' | 'failed';

export type Schedule = {
    id: number;
    novelId: number;
    novelTitle: string;
    novelCoverImage: string | null;
    novelUrl: string | null;
    daysOfWeek: number[];
    timeOfDay: string;
    autoCrawl: boolean;
    autoTts: boolean;
    autoDrive: boolean;
    active: boolean;
    runStage: ScheduleRunStage;
    lastStatus: ScheduleLastStatus | null;
    lastMessage: string | null;
    lastRunAt: string | null;
    nextRunAt: string | null;
    lastNewChapters: number | null;
    crawlJobId: number | null;
    ttsJobId: number | null;
    driveJobId: number | null;
    createdAt: string;
};

export type ScheduleBody = {
    novelId: number;
    daysOfWeek: number[];
    timeOfDay: string;
    autoCrawl: boolean;
    autoTts: boolean;
    autoDrive: boolean;
    active?: boolean;
};

export type UpdateScheduleBody = Partial<ScheduleBody>;

/** 0 = Chủ nhật, 1 = Thứ 2 … 6 = Thứ 7. */
export const DAY_OF_WEEK_LABEL: Record<number, string> = {
    0: 'Chủ nhật',
    1: 'Thứ 2',
    2: 'Thứ 3',
    3: 'Thứ 4',
    4: 'Thứ 5',
    5: 'Thứ 6',
    6: 'Thứ 7',
};

/** Thứ tự hiển thị: Thứ 2 → Chủ nhật. */
export const DAY_OF_WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const ALL_DAYS = [...DAY_OF_WEEK_ORDER];
export const WEEKDAYS = [1, 2, 3, 4, 5];
export const WEEKEND = [0, 6];

export function isScheduleRunning(schedule: Schedule | null | undefined): boolean {
    return !!schedule && schedule.runStage !== 'idle';
}

export function formatScheduleDays(daysOfWeek: number[]): string {
    const days = DAY_OF_WEEK_ORDER.filter((day) => daysOfWeek.includes(day));
    if (days.length === 7) {
        return 'Hàng ngày';
    }
    if (days.length === 5 && WEEKDAYS.every((day) => days.includes(day))) {
        return 'Thứ 2 – Thứ 6';
    }
    if (days.length === 2 && WEEKEND.every((day) => days.includes(day))) {
        return 'Cuối tuần';
    }
    return days.map((day) => DAY_OF_WEEK_LABEL[day]).join(', ');
}

export const listSchedules = () => axiosClient.get<Schedule[]>('/schedules');

export const createSchedule = (body: ScheduleBody) => axiosClient.post<Schedule>('/schedules', body);

export const updateSchedule = (id: number, body: UpdateScheduleBody) => axiosClient.patch<Schedule>(`/schedules/${id}`, body);

export const deleteSchedule = (id: number) => axiosClient.delete<{ ok: true }>(`/schedules/${id}`);

export const runScheduleNow = (id: number) => axiosClient.post<Schedule>(`/schedules/${id}/run`);
