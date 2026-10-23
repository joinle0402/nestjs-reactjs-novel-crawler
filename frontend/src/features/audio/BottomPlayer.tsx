import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Dropdown, Popover, Select, Slider, Space, Switch, Typography } from 'antd';
import {
    CloseOutlined,
    CustomerServiceOutlined,
    ForwardOutlined,
    KeyOutlined,
    PauseCircleFilled,
    PlayCircleFilled,
    BackwardOutlined,
    SoundOutlined,
} from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { RATES, useAudioPlayer } from '@/features/audio/AudioPlayerContext.tsx';
import { PLAYER_SHORTCUTS, type PlayerHotkeys } from '@/features/audio/usePlayerHotkeys.ts';
import { isActiveTtsJob } from '@/features/tts/api/ttsApi.ts';
import { TtsJobLine } from '@/features/tts/components/TtsJobLine.tsx';
import { useCurrentTtsJobQuery } from '@/features/tts/hooks/useTtsQueries.ts';
import { isActiveCrawlJob } from '@/features/crawl/api/crawlApi.ts';
import { CrawlJobLine } from '@/features/crawl/components/CrawlJobLine.tsx';
import { useCurrentCrawlJobQuery } from '@/features/crawl/hooks/useCrawlQueries.ts';
import { isActiveDriveJob } from '@/features/drive/api/driveApi.ts';
import { DriveJobLine } from '@/features/drive/components/DriveJobLine.tsx';
import { useCurrentDriveJobQuery } from '@/features/drive/hooks/useDriveQueries.ts';
import { useBgmTracksQuery } from '@/features/bgm/hooks/useBgmQueries.ts';

function formatTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) {
        return '0:00';
    }
    const total = Math.floor(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

const BGM_OFF_VALUE = '__bgm_off__';

type BottomPlayerProps = {
    siderWidth: number;
    hotkeys: PlayerHotkeys;
};

export function BottomPlayer({ siderWidth, hotkeys }: BottomPlayerProps) {
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
        effectiveBgmId,
        setBgmId,
        selectDefaultBgm,
    } = useAudioPlayer();
    const [playerEl, setPlayerEl] = useState<HTMLDivElement | null>(null);
    const tracksQuery = useBgmTracksQuery(Boolean(track));
    const tracks = tracksQuery.data ?? [];
    const selectDefaultBgmRef = useRef(selectDefaultBgm);
    useEffect(() => {
        selectDefaultBgmRef.current = selectDefaultBgm;
    }, [selectDefaultBgm]);
    useEffect(() => {
        if (!track) {
            return;
        }
        const ids = tracksQuery.data?.map((item) => item.id) ?? [];
        if (!ids.length && !track.hasBgm) {
            return;
        }
        selectDefaultBgmRef.current(ids, track.hasBgm);
    }, [track, tracksQuery.data]);

    // Đo chiều cao thật của thanh player → CSS var --player-h cho layout, thay vì padding cứng.
    useLayoutEffect(() => {
        const root = document.documentElement;
        if (!playerEl) {
            root.style.removeProperty('--player-h');
            return;
        }
        const sync = () => {
            root.style.setProperty('--player-h', `${playerEl.offsetHeight}px`);
        };
        sync();
        const observer = new ResizeObserver(sync);
        observer.observe(playerEl);
        return () => {
            observer.disconnect();
            root.style.removeProperty('--player-h');
        };
    }, [playerEl]);

    const jobQuery = useCurrentTtsJobQuery();
    const job = jobQuery.data;
    const jobActive = isActiveTtsJob(job);
    const crawlQuery = useCurrentCrawlJobQuery();
    const crawlJob = crawlQuery.data;
    const crawlActive = isActiveCrawlJob(crawlJob);
    const driveQuery = useCurrentDriveJobQuery();
    const driveJob = driveQuery.data;
    const driveActive = isActiveDriveJob(driveJob);

    if (!track && !jobActive && !crawlActive && !driveActive) {
        return null;
    }

    const isLoading = status === 'loading';
    const isPlaying = status === 'playing' || isLoading;

    return (
        <div
            ref={setPlayerEl}
            className={track ? `bottom-player${jobActive || crawlActive || driveActive ? ' bottom-player--with-job' : ''}` : 'bottom-player bottom-player--tts-only'}
            role="region"
            aria-label={track ? 'Trình nghe truyện' : 'Tiến độ tác vụ'}
            style={{ left: siderWidth }}
        >
            {driveActive && driveJob ? <DriveJobLine job={driveJob} /> : null}
            {crawlActive && crawlJob ? <CrawlJobLine job={crawlJob} /> : null}
            {jobActive && job ? <TtsJobLine job={job} /> : null}
            {track ? (
                <div className="bottom-player__body">
            <div className="bottom-player__meta">
                <SoundOutlined className="bottom-player__icon" />
                <div className="bottom-player__titles">
                    <Typography.Text strong ellipsis>
                        <Link to={`/novels/${track.novelId}?focusChapterId=${track.chapterId}`}>{track.novelTitle}</Link>
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
                        aria-keyshortcuts={hotkeys.enabled ? 'Shift+ArrowLeft' : undefined}
                        title={hotkeys.enabled ? 'Chương trước (Shift + ←)' : undefined}
                    />
                    <Button
                        type="text"
                        size="large"
                        loading={isLoading}
                        icon={isPlaying && !isLoading ? <PauseCircleFilled /> : <PlayCircleFilled />}
                        onClick={togglePlay}
                        aria-label={isPlaying ? 'Tạm dừng' : 'Phát'}
                        aria-keyshortcuts={hotkeys.enabled ? 'Space' : undefined}
                        title={hotkeys.enabled ? 'Phát / tạm dừng (Space)' : undefined}
                    />
                    <Button
                        type="text"
                        icon={<ForwardOutlined />}
                        disabled={!track.next}
                        onClick={() => void playNext()}
                        aria-label="Chương sau"
                        aria-keyshortcuts={hotkeys.enabled ? 'Shift+ArrowRight' : undefined}
                        title={hotkeys.enabled ? 'Chương sau (Shift + →)' : undefined}
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

                <Popover
                    trigger="click"
                    placement="topRight"
                    title="Nhạc nền"
                    content={
                        <div className="bottom-player__bgm-panel">
                            <Select
                                size="small"
                                aria-label="Nhạc nền"
                                style={{ width: '100%' }}
                                value={effectiveBgmId ?? BGM_OFF_VALUE}
                                loading={tracksQuery.isLoading}
                                disabled={!tracks.length}
                                options={[
                                    { value: BGM_OFF_VALUE, label: 'Không nhạc nền' },
                                    ...tracks.map((item) => ({ value: item.id, label: item.name })),
                                ]}
                                onChange={(value) =>
                                    setBgmId(typeof value === 'string' && value !== BGM_OFF_VALUE ? value : null)
                                }
                            />
                        </div>
                    }
                >
                    <Button
                        type="text"
                        className={`bottom-player__bgm-trigger${effectiveBgmId ? ' bottom-player__bgm-trigger--active' : ''}`}
                        icon={<CustomerServiceOutlined />}
                        aria-label="Nhạc nền"
                    />
                </Popover>

                <Popover
                    trigger="click"
                    placement="topRight"
                    title="Phím tắt nghe truyện"
                    content={
                        <div className="bottom-player__shortcuts">
                            <div className="bottom-player__shortcut-list">
                                {PLAYER_SHORTCUTS.map((shortcut) => (
                                    <div className="bottom-player__shortcut" key={shortcut.label}>
                                        <span className="bottom-player__shortcut-keys">
                                            {shortcut.keys.map((key) => (
                                                <kbd key={key}>{key}</kbd>
                                            ))}
                                        </span>
                                        <span className="bottom-player__shortcut-label">{shortcut.label}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="bottom-player__shortcut-toggle">
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    Bật phím tắt
                                </Typography.Text>
                                <Switch
                                    size="small"
                                    checked={hotkeys.enabled}
                                    onChange={hotkeys.setEnabled}
                                    aria-label="Bật phím tắt nghe truyện"
                                />
                            </div>
                        </div>
                    }
                >
                    <Button
                        type="text"
                        className={`bottom-player__hotkeys-trigger${hotkeys.enabled ? '' : ' bottom-player__hotkeys-trigger--off'}`}
                        icon={<KeyOutlined />}
                        aria-label="Phím tắt nghe truyện"
                    />
                </Popover>

                <Button type="text" icon={<CloseOutlined />} onClick={stop} aria-label="Đóng trình nghe" />
            </div>
                </div>
            ) : null}
        </div>
    );
}
