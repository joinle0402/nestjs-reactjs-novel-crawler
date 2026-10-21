import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createSchedule,
    deleteSchedule,
    listSchedules,
    runScheduleNow,
    updateSchedule,
    type Schedule,
    type ScheduleBody,
    type UpdateScheduleBody,
} from '@/features/schedules/api/schedulesApi.ts';

export const scheduleKeys = {
    all: ['schedules'] as const,
    list: () => [...scheduleKeys.all, 'list'] as const,
};

const POLL_MS = 5_000;

export function useSchedulesQuery() {
    return useQuery({
        queryKey: scheduleKeys.list(),
        queryFn: listSchedules,
        refetchInterval: (query) => {
            const rows = query.state.data;
            return Array.isArray(rows) && rows.some((row: Schedule) => row.runStage !== 'idle') ? POLL_MS : 30_000;
        },
    });
}

function useInvalidateSchedules() {
    const queryClient = useQueryClient();
    return () => {
        void queryClient.invalidateQueries({ queryKey: scheduleKeys.all });
    };
}

export function useCreateScheduleMutation() {
    const invalidate = useInvalidateSchedules();
    return useMutation({
        mutationFn: (body: ScheduleBody) => createSchedule(body),
        onSuccess: invalidate,
    });
}

export function useUpdateScheduleMutation() {
    const invalidate = useInvalidateSchedules();
    return useMutation({
        mutationFn: ({ id, body }: { id: number; body: UpdateScheduleBody }) => updateSchedule(id, body),
        onSuccess: invalidate,
    });
}

export function useDeleteScheduleMutation() {
    const invalidate = useInvalidateSchedules();
    return useMutation({
        mutationFn: (id: number) => deleteSchedule(id),
        onSuccess: invalidate,
    });
}

export function useRunScheduleNowMutation() {
    const invalidate = useInvalidateSchedules();
    return useMutation({
        mutationFn: (id: number) => runScheduleNow(id),
        onSuccess: invalidate,
    });
}
