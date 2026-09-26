import { useEffect, useRef, useState } from 'react';
import { Button, Drawer, Modal, Progress, Space, Tag, Typography, message } from 'antd';
import {
    FileTextOutlined,
    LoadingOutlined,
    SoundOutlined,
    StopOutlined,
    ExclamationCircleOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import type { TtsJob } from '@/features/tts/api/ttsApi.ts';
import { useStopTtsJobMutation, useTtsLogsQuery } from '@/features/tts/hooks/useTtsQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

type TtsJobLineProps = {
    job: TtsJob;
};

export function TtsJobLine({ job }: TtsJobLineProps) {
    const stopMutation = useStopTtsJobMutation();
    const [logOpen, setLogOpen] = useState(false);
    const logQuery = useTtsLogsQuery(logOpen);
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logOpen && logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logOpen, logQuery.data?.lines?.length]);

    const { done, total, currentChapterNumber, currentPercent, currentCharsDone, currentCharsTotal, totalCharsDone, totalChars } = job.progress;
    const overallPercent = total > 0 ? Math.floor((done / total) * 100) : 0;

    const isRunning = job.status === 'running';
    const isPending = job.status === 'pending';

    const onStop = () => {
        Modal.confirm({
            title: 'Dừng tạo audio?',
            icon: <ExclamationCircleOutlined />,
            content: 'Quá trình đang tạo audio sẽ bị hủy. Các chương đã tạo xong MP3 trước đó vẫn được giữ lại.',
            okText: 'Dừng ngay',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: () => {
                stopMutation.mutate(undefined, {
                    onSuccess: () => message.success('Đã dừng tạo audio'),
                    onError: (error) => message.error(getErrorMessage(error, 'Dừng tạo audio thất bại')),
                });
            },
        });
    };

    return (
        <>
            <div className="tts-job-bar">
                <div className="tts-job-bar__info">
                    <span className="tts-job-bar__engine">
                        <Tag color={job.engine === 'vieneu' ? 'purple' : 'blue'}>
                            {job.engine === 'vieneu' ? 'VieNeu' : 'Edge-TTS'}
                        </Tag>
                        <Tag color="cyan">{job.voice}</Tag>
                    </span>

                    <Typography.Text strong ellipsis className="tts-job-bar__title">
                        <Link to={`/novels/${job.novelId}`}>{job.novelTitle}</Link>
                    </Typography.Text>

                    <div className="tts-job-bar__metrics">
                        <Tag icon={isRunning ? <SyncOutlined spin /> : <LoadingOutlined />} color="processing">
                            {isPending ? 'Đang khởi động model...' : `Đang chạy: ${done}/${total} chương (${overallPercent}%)`}
                        </Tag>

                        {currentChapterNumber ? (
                            <span className="tts-job-bar__sub">
                                <strong>Ch.{currentChapterNumber}</strong>
                                {currentCharsTotal && currentCharsTotal > 0 ? (
                                    <>
                                        : {(currentCharsDone || 0).toLocaleString()} / {currentCharsTotal.toLocaleString()} chữ
                                        {currentPercent !== null ? ` (${currentPercent}%)` : ''}
                                    </>
                                ) : currentPercent !== null ? (
                                    `: ${currentPercent}%`
                                ) : (
                                    ''
                                )}
                            </span>
                        ) : null}

                        {totalChars > 0 ? (
                            <span className="tts-job-bar__sub tts-job-bar__sub--total">
                                (Tổng: {(totalCharsDone || 0).toLocaleString()}/{totalChars.toLocaleString()} chữ)
                            </span>
                        ) : null}
                    </div>
                </div>

                <div className="tts-job-bar__progress-box">
                    <Progress
                        percent={currentPercent !== null && currentPercent !== undefined ? currentPercent : overallPercent}
                        size="small"
                        status="active"
                        strokeColor={job.engine === 'vieneu' ? '#722ed1' : '#1677ff'}
                        format={(pct) => (currentChapterNumber ? `Chương: ${pct}%` : `${pct}%`)}
                    />
                </div>

                <Space orientation="horizontal" size="small" className="tts-job-bar__actions">
                    <Button
                        size="small"
                        icon={<FileTextOutlined />}
                        onClick={() => setLogOpen(true)}
                    >
                        Xem Log
                    </Button>
                    <Button
                        size="small"
                        danger
                        icon={<StopOutlined />}
                        loading={stopMutation.isPending}
                        onClick={onStop}
                    >
                        Dừng
                    </Button>
                </Space>
            </div>

            <Drawer
                title={
                    <Space>
                        <SoundOutlined />
                        <span>Log tiến trình TTS: {job.novelTitle}</span>
                        <Tag color={job.engine === 'vieneu' ? 'purple' : 'blue'}>
                            {job.engine === 'vieneu' ? 'VieNeu' : 'Edge-TTS'}
                        </Tag>
                    </Space>
                }
                placement="bottom"
                height={380}
                open={logOpen}
                onClose={() => setLogOpen(false)}
                extra={
                    <Button size="small" onClick={() => void logQuery.refetch()} loading={logQuery.isFetching}>
                        Làm mới
                    </Button>
                }
            >
                <div className="tts-log-viewer">
                    {logQuery.data?.lines && logQuery.data.lines.length > 0 ? (
                        logQuery.data.lines.map((line, idx) => {
                            const isErr = line.includes('Error') || line.includes('Lỗi') || line.includes('failed') || line.includes('Exception');
                            const isSuccess = line.includes('completed') || line.includes('thành công') || line.includes('sẵn sàng');
                            return (
                                <div
                                    key={idx}
                                    className={`tts-log-line ${isErr ? 'tts-log-line--err' : isSuccess ? 'tts-log-line--ok' : ''}`}
                                >
                                    {line}
                                </div>
                            );
                        })
                    ) : (
                        <div className="tts-log-empty">Chưa có nhật ký log nào...</div>
                    )}
                    <div ref={logEndRef} />
                </div>
            </Drawer>
        </>
    );
}
