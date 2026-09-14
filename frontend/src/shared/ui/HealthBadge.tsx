import { Tag } from 'antd';
import { useHealthQuery } from '@/features/health/hooks/useHealthQuery.ts';

export function HealthBadge() {
    const { data, isLoading, isError } = useHealthQuery();
    if (isLoading) {
        return <Tag>API: đang kiểm tra</Tag>;
    }
    if (isError || data?.status !== 'ok') {
        return <Tag color="error">API: mất kết nối</Tag>;
    }
    return <Tag color="success">API: đã kết nối</Tag>;
}
