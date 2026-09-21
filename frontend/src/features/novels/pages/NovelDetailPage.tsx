import {
    Alert,
    Breadcrumb,
    Button,
    Card,
    Empty,
    Modal,
    Select,
    Space,
    Spin,
    Switch,
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CaretRightOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { useNovelQuery } from '@/features/novels/hooks/useNovelQuery.ts';
import { useNovelStatsQuery } from '@/features/novels/hooks/useNovelStatsQuery.ts';
import { useChaptersQuery } from '@/features/chapters/hooks/useChaptersQuery.ts';
import {
    useCreateChapterMutation,
    useDeleteChapterMutation,
    useUpdateChapterMutation,
} from '@/features/chapters/hooks/useChapterMutations.ts';
import { ChapterFormModal, type ChapterFormValues } from '@/features/chapters/components/ChapterFormModal.tsx';
import type { ChapterListItem, ListChaptersParams } from '@/features/chapters/api/chaptersApi.ts';
import { JobStatusTag } from '@/shared/ui/JobStatusTag.tsx';
import { JOB_STATUS_OPTIONS, JobStatus, type JobStatus as JobStatusValue } from '@/shared/types/jobStatus.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';
import { parseRouteId } from '@/shared/lib/parseRouteId.ts';
import { useAudioPlayer } from '@/features/audio/AudioPlayerContext.tsx';

const PAGE_SIZE = 12;

function readStatusParam(value: string | null): JobStatusValue | undefined {
    if (!value) {
        return undefined;
    }
    return Object.values(JobStatus).includes(value as JobStatusValue) ? (value as JobStatusValue) : undefined;
}

function readBooleanParam(value: string | null): boolean | undefined {
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    return undefined;
}

export function NovelDetailPage() {
    const { novelId: novelIdParam } = useParams();
    const novelId = parseRouteId(novelIdParam);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { playChapter, track, status } = useAudioPlayer();
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<ChapterListItem | null>(null);

    const createMutation = useCreateChapterMutation();
    const updateMutation = useUpdateChapterMutation();
    const deleteMutation = useDeleteChapterMutation();

    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
    const crawlStatus = readStatusParam(searchParams.get('crawlStatus'));
    const ttsStatus = readStatusParam(searchParams.get('ttsStatus'));
    const hasMp3 = readBooleanParam(searchParams.get('hasMp3'));

    const chapterParams: ListChaptersParams = useMemo(
        () => ({
            page,
            limit: PAGE_SIZE,
            crawlStatus,
            ttsStatus,
            hasMp3,
        }),
        [page, crawlStatus, ttsStatus, hasMp3],
    );

    const novelQuery = useNovelQuery(novelId);
    const statsQuery = useNovelStatsQuery(novelId);
    const chaptersQuery = useChaptersQuery(novelId, chapterParams);

    const updateFilters = (patch: Record<string, string | undefined>) => {
        const next = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(patch)) {
            if (value) {
                next.set(key, value);
            } else {
                next.delete(key);
            }
        }
        if (!patch.page) {
            next.delete('page');
        }
        setSearchParams(next);
    };

    const openCreate = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const openEdit = (chapter: ChapterListItem) => {
        setEditing(chapter);
        setFormOpen(true);
    };

    const closeForm = () => {
        setFormOpen(false);
        setEditing(null);
    };

    const handleSubmit = (values: ChapterFormValues) => {
        if (!novelId) {
            return;
        }

        const content = values.content?.trim();
        const chapterSiteId = values.chapterSiteId?.trim() || undefined;

        if (editing) {
            updateMutation.mutate(
                {
                    id: editing.id,
                    body: {
                        chapterNumber: values.chapterNumber,
                        title: values.title.trim(),
                        chapterSiteId,
                        ...(content !== undefined && content !== '' ? { content } : {}),
                    },
                },
                {
                    onSuccess: () => {
                        message.success('Đã cập nhật chương');
                        closeForm();
                    },
                    onError: (err) => message.error(getErrorMessage(err, 'Cập nhật chương thất bại')),
                },
            );
            return;
        }

        createMutation.mutate(
            {
                novelId,
                chapterNumber: values.chapterNumber,
                title: values.title.trim(),
                chapterSiteId,
                content: content || undefined,
            },
            {
                onSuccess: () => {
                    message.success('Đã thêm chương');
                    closeForm();
                },
                onError: (err) => message.error(getErrorMessage(err, 'Thêm chương thất bại')),
            },
        );
    };

    const handleDelete = (chapter: ChapterListItem) => {
        Modal.confirm({
            title: 'Xóa chương?',
            content: `Xóa "${chapter.title}". Không thể hoàn tác.`,
            okText: 'Xóa',
            okType: 'danger',
            cancelText: 'Hủy',
            onOk: () =>
                deleteMutation.mutateAsync({ id: chapter.id, novelId: chapter.novelId }).then(
                    () => {
                        message.success('Đã xóa chương');
                    },
                    (err) => {
                        message.error(getErrorMessage(err, 'Xóa chương thất bại'));
                        return Promise.reject(err);
                    },
                ),
        });
    };

    const columns: ColumnsType<ChapterListItem> = [
        {
            title: '#',
            dataIndex: 'chapterNumber',
            width: 80,
        },
        {
            title: 'Chương',
            dataIndex: 'title',
            ellipsis: true,
            render: (title: string, chapter) => <Link to={`/novels/${novelId}/chapters/${chapter.id}`}>{title}</Link>,
        },
        {
            title: 'Crawl',
            dataIndex: 'crawlStatus',
            width: 120,
            render: (statusValue: JobStatusValue) => <JobStatusTag status={statusValue} />,
        },
        {
            title: 'TTS',
            dataIndex: 'ttsStatus',
            width: 120,
            render: (statusValue: JobStatusValue) => <JobStatusTag status={statusValue} />,
        },
        {
            title: 'MP3',
            dataIndex: 'hasMp3',
            width: 90,
            render: (value: boolean) => (value ? <Tag color="green">Có</Tag> : <Tag>Chưa</Tag>),
        },
        {
            title: '',
            key: 'actions',
            width: 160,
            fixed: 'right',
            render: (_, chapter) => (
                <Space size={0} onClick={(event) => event.stopPropagation()}>
                    {chapter.hasMp3 && novelId && novelQuery.data ? (
                        <Button
                            type="link"
                            size="small"
                            icon={<CaretRightOutlined />}
                            loading={status === 'loading' && track?.chapterId === chapter.id}
                            onClick={() => {
                                void playChapter({
                                    novelId,
                                    novelTitle: novelQuery.data.title,
                                    chapterId: chapter.id,
                                });
                            }}
                        >
                            Nghe
                        </Button>
                    ) : null}
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        aria-label="Sửa chương"
                        onClick={() => openEdit(chapter)}
                    />
                    <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        aria-label="Xóa chương"
                        onClick={() => handleDelete(chapter)}
                    />
                </Space>
            ),
        },
    ];

    if (!novelId) {
        return <Alert type="error" showIcon title="ID truyện không hợp lệ" />;
    }

    if (novelQuery.isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}>
                <Spin size="large" />
            </div>
        );
    }

    if (novelQuery.isError || !novelQuery.data) {
        return <Alert type="error" showIcon title="Không tải được truyện" description={getErrorMessage(novelQuery.error)} />;
    }

    const novel = novelQuery.data;
    const stats = statsQuery.data;

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Breadcrumb
                items={[
                    { title: <Link to="/">Dashboard</Link> },
                    { title: novel.title },
                ]}
            />
            <Card
                size="small"
                title={
                    <>
                        {novel.title}{' '}
                        <Typography.Link href={novel.url} target="_blank" rel="noreferrer" style={{ fontWeight: 'normal', fontSize: 13 }}>
                            (Nguồn)
                        </Typography.Link>
                        {' - '}
                        {novel.author || 'Không rõ tác giả'} - {stats?.total} chương | {stats?.crawled} đã crawl |{' '}
                        {stats?.ttsDone} đã TTS | {stats?.crawlFailed} lỗi crawl / {stats?.ttsFailed} lỗi TTS
                    </>
                }
                extra={
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                        Thêm chương
                    </Button>
                }
            >
                <Space wrap style={{ marginBottom: 12 }}>
                    <Select
                        allowClear
                        placeholder="Lọc crawl"
                        style={{ width: 160 }}
                        options={JOB_STATUS_OPTIONS}
                        value={crawlStatus}
                        onChange={(value) => updateFilters({ crawlStatus: value })}
                    />
                    <Select
                        allowClear
                        placeholder="Lọc TTS"
                        style={{ width: 160 }}
                        options={JOB_STATUS_OPTIONS}
                        value={ttsStatus}
                        onChange={(value) => updateFilters({ ttsStatus: value })}
                    />
                    <Space>
                        <Switch checked={hasMp3 === true} onChange={(checked) => updateFilters({ hasMp3: checked ? 'true' : undefined })} />
                        <Typography.Text>Chỉ chương có MP3</Typography.Text>
                    </Space>
                </Space>

                {chaptersQuery.isError ? (
                    <Alert type="error" showIcon title="Không tải được mục lục" description={getErrorMessage(chaptersQuery.error)} />
                ) : !chaptersQuery.isLoading && !chaptersQuery.data?.data.length ? (
                    <Empty description="Không có chương phù hợp bộ lọc.">
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                            Thêm chương
                        </Button>
                    </Empty>
                ) : (
                    <Table<ChapterListItem>
                        rowKey="id"
                        size="small"
                        columns={columns}
                        dataSource={chaptersQuery.data?.data}
                        loading={chaptersQuery.isFetching}
                        pagination={{
                            current: chaptersQuery.data?.meta.page ?? page,
                            pageSize: PAGE_SIZE,
                            total: chaptersQuery.data?.meta.total ?? 0,
                            showSizeChanger: false,
                            showTotal: (total) => `${total} chương`,
                        }}
                        onChange={(pagination) => updateFilters({ page: String(pagination.current ?? 1) })}
                        onRow={(chapter) => ({
                            style: { cursor: 'pointer' },
                            onClick: () => navigate(`/novels/${novelId}/chapters/${chapter.id}`),
                        })}
                        scroll={{ x: 900 }}
                    />
                )}
            </Card>

            <ChapterFormModal
                open={formOpen}
                chapter={editing}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                onCancel={closeForm}
                onSubmit={handleSubmit}
            />
        </Space>
    );
}
