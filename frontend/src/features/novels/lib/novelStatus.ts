export function statusOf(
    done: number,
    failed: number,
    total: number,
    runningColor: string,
): { color: string; label: string; running: boolean } {
    if (failed > 0) {
        return { color: '#ff4d4f', label: 'Có lỗi', running: false };
    }
    if (total > 0 && done >= total) {
        return { color: '#52c41a', label: 'Hoàn tất', running: false };
    }
    if (done > 0) {
        return { color: runningColor, label: 'Đang chạy', running: true };
    }
    return { color: '#d9d9d9', label: 'Chưa bắt đầu', running: false };
}
