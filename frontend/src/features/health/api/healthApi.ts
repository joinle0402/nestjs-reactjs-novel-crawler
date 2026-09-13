import { axiosClient } from '@/shared/api/axiosClient.ts';

export type HealthResponse = { status: string };

export const getHealth = () => axiosClient.get<HealthResponse>('/health');
