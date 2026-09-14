export function getErrorMessage(error: unknown, fallback = 'Không tải được dữ liệu'): string {
    if (typeof error === 'object' && error && 'message' in error) {
        const message = (error as { message: unknown }).message;
        if (typeof message === 'string' && message.trim()) {
            return message;
        }
        if (Array.isArray(message) && message.length > 0) {
            return message.map(String).join(', ');
        }
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
}
