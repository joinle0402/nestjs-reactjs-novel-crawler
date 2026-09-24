import { Button, Typography, message } from 'antd';
import { Link } from 'react-router-dom';
import type { TtsJob } from '@/features/tts/api/ttsApi.ts';
import { useStopTtsJobMutation } from '@/features/tts/hooks/useTtsQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

type TtsJobLineProps = {
    job: TtsJob;
};

export function TtsJobLine({ job }: TtsJobLineProps) {
    const stopMutation = useStopTtsJobMutation();
    const fraction = job.progress.total > 0 ? ` — ${job.progress.done}/${job.progress.total}` : '';

    return (
        <div className="tts-job-line">
            <Typography.Text ellipsis className="tts-job-line__text">
                <Link to={`/novels/${job.novelId}`}>
                    Đang tạo audio: {job.novelTitle}
                    {fraction}
                </Link>
            </Typography.Text>
            <Button
                size="small"
                danger
                loading={stopMutation.isPending}
                onClick={() => {
                    stopMutation.mutate(undefined, {
                        onSuccess: () => message.success('Đã dừng tạo audio'),
                        onError: (error) => message.error(getErrorMessage(error, 'Dừng tạo audio thất bại')),
                    });
                }}
            >
                Dừng
            </Button>
        </div>
    );
}
