import { Tag } from 'antd';
import { PauseCircleOutlined } from '@ant-design/icons';
import { useEffect, useState } from 'react';
import type { CrawlRestKind } from '@/features/crawl/api/crawlApi.ts';

function formatCountdown(seconds: number): string {
    const clamped = Math.max(0, Math.ceil(seconds));
    const m = Math.floor(clamped / 60);
    const s = clamped % 60;
    return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`;
}

const KIND_LABEL: Record<CrawlRestKind, string> = {
    chapter: 'Nghỉ trước chương tiếp',
    batch: 'Nghỉ batch (5 chương)',
};

type CrawlRestTagProps = {
    restUntil: string | null;
    restKind: CrawlRestKind | null;
};

export function CrawlRestTag({ restUntil, restKind }: CrawlRestTagProps) {
    // Chỉ dùng state để buộc re-render; số giây luôn tính lại từ restUntil
    // (mốc tuyệt đối) ngay lúc render nên không bao giờ trôi/jumps.
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!restUntil) {
            return;
        }
        const timer = window.setInterval(() => setTick((tick) => tick + 1), 250);
        // Tab bị ẩn/throttle làm interval trễ — bù ngay khi quay lại xem.
        const sync = () => setTick((tick) => tick + 1);
        document.addEventListener('visibilitychange', sync);
        window.addEventListener('focus', sync);
        window.addEventListener('pageshow', sync);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', sync);
            window.removeEventListener('focus', sync);
            window.removeEventListener('pageshow', sync);
        };
    }, [restUntil]);

    if (!restUntil || !restKind) {
        return null;
    }
    const remaining = (new Date(restUntil).getTime() - Date.now()) / 1000;
    if (remaining <= 0) {
        return null;
    }
    return (
        <Tag icon={<PauseCircleOutlined />} color="warning" className="tts-job-line__rest">
            {KIND_LABEL[restKind]} — {formatCountdown(remaining)}
        </Tag>
    );
}
