import { Alert, Breadcrumb, Button, Card, Result, Space, Spin, Tag, Typography } from 'antd';
import { CaretRightOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useChapterQuery } from '@/features/chapters/hooks/useChapterQuery.ts';
import { useNovelQuery } from '@/features/novels/hooks/useNovelQuery.ts';
import { JobStatusTag } from '@/shared/ui/JobStatusTag.tsx';
import { JobStatus } from '@/shared/types/jobStatus.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';
import { parseRouteId } from '@/shared/lib/parseRouteId.ts';
import { useAudioPlayer } from '@/features/audio/AudioPlayerContext.tsx';

export function ChapterReaderPage() {
    const { novelId: novelIdParam, chapterId: chapterIdParam } = useParams();
    const novelId = parseRouteId(novelIdParam);
    const chapterId = parseRouteId(chapterIdParam);
    const navigate = useNavigate();
    const { playChapter, track, status, togglePlay } = useAudioPlayer();

    const chapterQuery = useChapterQuery(chapterId);
    const novelQuery = useNovelQuery(chapterQuery.data?.novelId ?? novelId);

    if (!chapterId) {
        return <Alert type="error" showIcon title="ID chương không hợp lệ" />;
    }

    if (chapterQuery.isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
                <Spin size="large" />
            </div>
        );
    }

    if (chapterQuery.isError || !chapterQuery.data) {
        return <Result status="404" title="Không tìm thấy chương" subTitle={getErrorMessage(chapterQuery.error)} extra={<Link to={novelId ? `/novels/${novelId}` : '/'}>Quay lại</Link>} />;
    }

    const chapter = chapterQuery.data;
    const novelTitle = novelQuery.data?.title ?? 'Truyện';
    const parentPath = `/novels/${chapter.novelId}`;
    const hasContent = Boolean(chapter.content?.trim());
    const isCurrentTrack = track?.chapterId === chapter.id;
    const isPlayingThis = isCurrentTrack && (status === 'playing' || status === 'loading');

    const goTo = (id: number) => navigate(`/novels/${chapter.novelId}/chapters/${id}`);

    const onListen = () => {
        if (isCurrentTrack) {
            togglePlay();
            return;
        }
        void playChapter({
            novelId: chapter.novelId,
            novelTitle,
            chapterId: chapter.id,
        });
    };

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Breadcrumb
                items={[
                    { title: <Link to="/">Dashboard</Link> },
                    { title: <Link to={parentPath}>{novelTitle}</Link> },
                    { title: `Chương ${chapter.chapterNumber}` },
                ]}
            />

            <Card>
                <Space wrap style={{ marginBottom: 8 }}>
                    <JobStatusTag prefix="Crawl" status={chapter.crawlStatus} />
                    <JobStatusTag prefix="TTS" status={chapter.ttsStatus} />
                    {chapter.hasMp3 ? <Tag color="green">MP3 có sẵn</Tag> : <Tag>Chưa có MP3</Tag>}
                </Space>
                <Typography.Title level={2} style={{ marginTop: 0 }}>
                    {chapter.title}
                </Typography.Title>

                {chapter.hasMp3 ? (
                    <Button
                        type="primary"
                        icon={<CaretRightOutlined />}
                        loading={status === 'loading' && isCurrentTrack}
                        onClick={onListen}
                        style={{ marginBottom: 16 }}
                    >
                        {isPlayingThis ? 'Tạm dừng' : isCurrentTrack ? 'Tiếp tục' : 'Nghe chương này'}
                    </Button>
                ) : (
                    <Alert type="info" showIcon style={{ marginBottom: 16 }} title="Chương này chưa có file MP3." />
                )}

                {hasContent ? (
                    <article className="chapter-content">{chapter.content}</article>
                ) : (
                    <EmptyState crawlStatus={chapter.crawlStatus} />
                )}

                <Space style={{ marginTop: 32, width: '100%', justifyContent: 'space-between' }}>
                    <Button icon={<LeftOutlined />} disabled={!chapter.prev} onClick={() => chapter.prev && goTo(chapter.prev.id)}>
                        {chapter.prev ? `Chương ${chapter.prev.chapterNumber}` : 'Hết'}
                    </Button>
                    <Button type="link" onClick={() => navigate(parentPath)}>
                        Mục lục
                    </Button>
                    <Button type="primary" icon={<RightOutlined />} iconPlacement="end" disabled={!chapter.next} onClick={() => chapter.next && goTo(chapter.next.id)}>
                        {chapter.next ? `Chương ${chapter.next.chapterNumber}` : 'Hết'}
                    </Button>
                </Space>
            </Card>
        </Space>
    );
}

function EmptyState({ crawlStatus }: { crawlStatus: string }) {
    if (crawlStatus === JobStatus.FAILED) {
        return <Alert type="error" showIcon title="Chương này cào lỗi, chưa có nội dung." />;
    }
    if (crawlStatus === JobStatus.PROCESSING) {
        return <Alert type="info" showIcon title="Đang cào chương này." />;
    }
    return (
        <Alert
            type="warning"
            showIcon
            title="Chưa có nội dung. Nhập tay từ mục lục (Sửa) hoặc cào bằng Python worker."
        />
    );
}
