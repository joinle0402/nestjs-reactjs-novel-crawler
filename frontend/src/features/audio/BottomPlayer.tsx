import { Button, Dropdown, Slider, Space, Typography } from 'antd';
import {
    CloseOutlined,
    ForwardOutlined,
    PauseCircleFilled,
    PlayCircleFilled,
    BackwardOutlined,
    SoundOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { RATES, useAudioPlayer } from '@/features/audio/AudioPlayerContext.tsx';

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

type BottomPlayerProps = {
    siderWidth: number;
};

export function BottomPlayer({ siderWidth }: BottomPlayerProps) {
    const {
        track,
        status,
        currentTime,
        duration,
        rate,
        errorMessage,
        togglePlay,
        seek,
        setRate,
        playPrev,
        playNext,
        stop,
    } = useAudioPlayer();

    if (!track) {
        return null;
    }

    const isLoading = status === 'loading';
    const isPlaying = status === 'playing' || isLoading;

    return (
        <div
            className="bottom-player"
            role="region"
            aria-label="Trình nghe truyện"
            style={{ left: siderWidth }}
        >
            <div className="bottom-player__meta">
                <SoundOutlined className="bottom-player__icon" />
                <div className="bottom-player__titles">
                    <Typography.Text strong ellipsis>
                        <Link to={`/novels/${track.novelId}`}>{track.novelTitle}</Link>
                    </Typography.Text>
                    <Typography.Text type="secondary" ellipsis>
                        <Link to={`/novels/${track.novelId}/chapters/${track.chapterId}`}>
                            Chương {track.chapterNumber} · {track.chapterTitle}
                        </Link>
                    </Typography.Text>
                    {errorMessage ? (
                        <Typography.Text type="danger" style={{ fontSize: 12 }}>
                            {errorMessage}
                        </Typography.Text>
                    ) : null}
                </div>
            </div>

            <div className="bottom-player__progress">
                <Slider
                    min={0}
                    max={duration > 0 ? duration : 1}
                    step={0.1}
                    value={Math.min(currentTime, duration || currentTime)}
                    tooltip={{ formatter: (value) => formatTime(value ?? 0) }}
                    onChange={(value) => seek(value)}
                    disabled={!duration}
                />
                <div className="bottom-player__times">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            <div className="bottom-player__controls">
                <Space size={4}>
                    <Button
                        type="text"
                        icon={<BackwardOutlined />}
                        disabled={!track.prev}
                        onClick={() => void playPrev()}
                        aria-label="Chương trước"
                    />
                    <Button
                        type="text"
                        size="large"
                        loading={isLoading}
                        icon={isPlaying && !isLoading ? <PauseCircleFilled /> : <PlayCircleFilled />}
                        onClick={togglePlay}
                        aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                    />
                    <Button
                        type="text"
                        icon={<ForwardOutlined />}
                        disabled={!track.next}
                        onClick={() => void playNext()}
                        aria-label="Chương sau"
                    />
                </Space>

                <Dropdown
                    menu={{
                        items: RATES.map((value) => ({
                            key: String(value),
                            label: `${value.toFixed(2).replace(/\.00$/, '')}x`,
                            onClick: () => setRate(value),
                        })),
                    }}
                    trigger={['click']}
                >
                    <Button type="text">{rate}x</Button>
                </Dropdown>

                <Button type="text" icon={<CloseOutlined />} onClick={stop} aria-label="Đóng trình nghe" />
            </div>
        </div>
    );
}
