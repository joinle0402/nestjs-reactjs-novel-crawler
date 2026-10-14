import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBgmTrack, deleteBgmTrack, listBgmTracks } from '@/features/bgm/api/bgmApi.ts';

export const bgmKeys = {
    all: ['bgm'] as const,
};

export function useBgmTracksQuery(enabled = true) {
    return useQuery({
        queryKey: bgmKeys.all,
        queryFn: listBgmTracks,
        enabled,
    });
}

export function useCreateBgmTrackMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: createBgmTrack,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: bgmKeys.all });
        },
    });
}

export function useDeleteBgmTrackMutation() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: deleteBgmTrack,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: bgmKeys.all });
        },
    });
}
