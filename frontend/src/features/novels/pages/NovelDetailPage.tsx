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
    Table,
    Tag,
    Typography,
    message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CaretRightOutlined, CloudDownloadOutlined, CloudUploadOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SoundOutlined } from '@ant-design/icons';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNovelQuery } from '@/features/novels/hooks/useNovelQuery.ts';
import { useNovelStatsQuery } from '@/features/novels/hooks/useNovelStatsQuery.ts';
import { useChaptersQuery } from '@/features/chapters/hooks/useChaptersQuery.ts';
import { useChapterQuery } from '@/features/chapters/hooks/useChapterQuery.ts';
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
import { isActiveTtsJob } from '@/features/tts/api/ttsApi.ts';
import { TtsRunModal, type TtsRunRequest } from '@/features/tts/components/TtsRunModal.tsx';
import { useCurrentTtsJobQuery, useTtsPreviewQuery } from '@/features/tts/hooks/useTtsQueries.ts';
import { formatChapterRangeInput } from '@/features/tts/lib/chapterRange.ts';
import { isActiveCrawlJob } from '@/features/crawl/api/crawlApi.ts';
import { useCreateCrawlJobMutation, useCurrentCrawlJobQuery } from '@/features/crawl/hooks/useCrawlQueries.ts';
import { isActiveDriveJob } from '@/features/drive/api/driveApi.ts';
import { UploadDriveDrawer, type DriveRunRequest } from '@/features/drive/components/UploadDriveDrawer.tsx';
import { useCurrentDriveJobQuery, useDrivePreviewQuery } from '@/features/drive/hooks/useDriveQueries.ts';

const PAGE_SIZE = 12;

const { CheckableTag } = Tag;

const PILL_COLORS = {
    crawl: '#1677ff',
    tts: '#722ed1',
    drive: '#52c41a',
} as const;

function StatPill({ color, checked, onChange, children }: { color: string; checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
    return (
        <CheckableTag
            checked={checked}
            onChange={onChange}
            style={{
                borderRadius: 999,
                border: `1px solid ${color}`,
                color: checked ? '#fff' : color,
                backgroundColor: checked ? color : 'transparent',
            }}
        >
            {children}
        </CheckableTag>
    );
}

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

function baseName(filePath: string): string {
    return filePath.split(/[\\/]/).pop() ?? '';
}

export function NovelDetailPage() {
    const { novelId: novelIdParam } = useParams();
    const novelId = parseRouteId(novelIdParam);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { playChapter, track, status } = useAudioPlayer();
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<ChapterListItem | null>(null);
    const [selectedChapters, setSelectedChapters] = useState<Map<number, number>>(new Map());
    const [runRequest, setRunRequest] = useState<TtsRunRequest | null>(null);
    const [driveRequest, setDriveRequest] = useState<DriveRunRequest | null>(null);

    const createMutation = useCreateChapterMutation();
    const crawlMutation = useCreateCrawlJobMutation();
    const crawlQuery = useCurrentCrawlJobQuery();
    const crawlActive = isActiveCrawlJob(crawlQuery.data);
    const driveQuery = useCurrentDriveJobQuery();
    const driveActive = isActiveDriveJob(driveQuery.data);
    const drivePreviewQuery = useDrivePreviewQuery(novelId);
    const updateMutation = useUpdateChapterMutation();
    const deleteMutation = useDeleteChapterMutation();

    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
    const crawlStatus = readStatusParam(searchParams.get('crawlStatus'));
    const ttsStatus = readStatusParam(searchParams.get('ttsStatus'));
    const onDrive = readBooleanParam(searchParams.get('onDrive'));

    const chapterParams: ListChaptersParams = useMemo(
        () => ({
            page,
            limit: PAGE_SIZE,
            crawlStatus,
            ttsStatus,
            onDrive,
        }),
        [page, crawlStatus, ttsStatus, onDrive],
    );
    const driveExistingNames = useMemo(
        () => new Set(drivePreviewQuery.data?.existingNames ?? []),
        [drivePreviewQuery.data],
    );

    const novelQuery = useNovelQuery(novelId);
    const jobQuery = useCurrentTtsJobQuery();
    const jobActive = isActiveTtsJob(jobQuery.data);
    const jobHere = jobActive && jobQuery.data?.novelId === novelId;
    const pollMs = jobHere ? 3000 : false;
    const statsQuery = useNovelStatsQuery(novelId, { refetchInterval: pollMs });
    const chaptersQuery = useChaptersQuery(novelId, chapterParams, { refetchInterval: pollMs });
    const previewQuery = useTtsPreviewQuery(novelId, undefined, pollMs);
    const editingDetailQuery = useChapterQuery(formOpen && editing ? editing.id : undefined);

    useEffect(() => {
        setSelectedChapters(new Map());
        setRunRequest(null);
        setDriveRequest(null);
    }, [novelId]);

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
            const trimmedContent = values.content?.trim() ?? '';
            updateMutation.mutate(
                {
                    id: editing.id,
                    body: {
                        chapterNumber: values.chapterNumber,
                        title: values.title.trim(),
                        chapterSiteId,
                        content: trimmedContent || null,
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
            width: 90,
            render: (statusValue: JobStatusValue) => <JobStatusTag status={statusValue} />,
        },
        {
            title: 'Drive',
            key: 'drive',
            width: 90,
            render: (_, chapter) => {
                return <JobStatusTag status={driveChecked && chapter.hasMp3 ? JobStatus.COMPLETED : JobStatus.PENDING} />;
            },
        },
        {
            title: '',
            key: 'actions',
            width: 160,
            fixed: 'right',
            render: (_, chapter) => (
                <Space size={0} onClick={(event) => event.stopPropagation()}>
                    <Button
                        disabled={!chapter.hasMp3 || !novelId || !novelQuery.data}
                        type="link"
                        size="small"
                        icon={<CaretRightOutlined />}
                        title="Nghe"
                        aria-label="Nghe chương"
                        loading={status === 'loading' && track?.chapterId === chapter.id}
                        onClick={() => {
                            if (!novelId || !novelQuery.data) return;
                            void playChapter({
                                novelId,
                                novelTitle: novelQuery.data.title,
                                chapterId: chapter.id,
                            });
                        }}
                    />
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
    const missing = previewQuery.data?.missing ?? 0;
    const failed = previewQuery.data?.failed ?? 0;
    const selectedNumbers = [...selectedChapters.values()].sort((a, b) => a - b);

    const driveChecked = drivePreviewQuery.data?.driveChecked ?? false;
    const driveFolderId = drivePreviewQuery.data?.driveFolderId ?? null;
    const driveDone =
        drivePreviewQuery.data?.driveChecked && drivePreviewQuery.data.missingOnDrive != null
            ? Math.max(0, drivePreviewQuery.data.totalFiles - drivePreviewQuery.data.missingOnDrive)
            : null;
    const hasOnDrive = (drivePreviewQuery.data?.existingNames?.length ?? 0) > 0;
    const isOnDrive = (chapter: ChapterListItem) =>
        driveChecked && chapter.hasMp3 && Boolean(chapter.mp3Path) && driveExistingNames.has(baseName(chapter.mp3Path!));
    const ttsAction = (() => {
        if (selectedNumbers.length > 0) {
            return {
                label: `Tạo audio (${selectedNumbers.length})`,
                request: { scope: 'chapters' as const, chapterRange: formatChapterRangeInput(selectedNumbers) },
            };
        }
        if (!previewQuery.data) {
            return null;
        }
        if (missing > 0 && failed !== missing) {
            return { label: `Tạo audio (${missing})`, request: { scope: 'missing' as const, chapterRange: '' } };
        }
        if (failed > 0) {
            return { label: `Chạy lại lỗi (${failed})`, request: { scope: 'failed' as const, chapterRange: '' } };
        }
        return null;
    })();

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
                    <div style={{ minWidth: 0 }}>
                        <div>
                            {novel.title}{' '}
                            <Typography.Link href={novel.url} target="_blank" rel="noreferrer" style={{ fontWeight: 'normal', fontSize: 13 }}>
                                (Nguồn)
                            </Typography.Link>
                            {hasOnDrive && driveFolderId ? (
                                <Typography.Link
                                    href={`https://drive.google.com/drive/folders/${driveFolderId}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{ fontWeight: 'normal', fontSize: 13 }}
                                >
                                    (Drive)
                                </Typography.Link>
                            ) : null}
                            {' - '}
                            {novel.author || 'Không rõ tác giả'}
                        </div>
                    </div>
                }
                extra={
                    <Space>
                        {ttsAction ? (
                            <Button
                                icon={<SoundOutlined />}
                                disabled={jobActive}
                                onClick={() => setRunRequest(ttsAction.request)}
                            >
                                {ttsAction.label}
                            </Button>
                        ) : null}
                        <Button
                            icon={<CloudUploadOutlined />}
                            disabled={driveActive}
                            title={driveActive ? 'Đang có job upload Drive' : 'Upload MP3 lên Google Drive'}
                            onClick={() =>
                                setDriveRequest(
                                    selectedNumbers.length > 0
                                        ? { scope: 'chapters', chapterRange: formatChapterRangeInput(selectedNumbers) }
                                        : { scope: 'missing', chapterRange: '' },
                                )
                            }
                        >
                            {selectedNumbers.length > 0 ? `Upload Drive (${selectedNumbers.length})` : 'Upload Drive'}
                        </Button>
                        <Button
                            icon={<CloudDownloadOutlined />}
                            loading={crawlMutation.isPending}
                            disabled={crawlActive}
                            title={crawlActive ? 'Đang có tác vụ cào khác' : undefined}
                            onClick={() => {
                                if (selectedNumbers.length === 0) {
                                    navigate(`/crawl?novelId=${novel.id}`);
                                    return;
                                }
                                const chapterRange = formatChapterRangeInput(selectedNumbers);
                                crawlMutation.mutate(
                                    {
                                        novelId: novel.id,
                                        url: novel.url,
                                        scope: 'chapters',
                                        chapterRange,
                                    },
                                    {
                                        onSuccess: (job) => {
                                            message.success(`Đã tạo tác vụ cào ${chapterRange}`);
                                            navigate(`/crawl?jobId=${job.id}`);
                                        },
                                        onError: (error) => message.error(getErrorMessage(error, 'Không tạo được tác vụ cào')),
                                    },
                                );
                            }}
                        >
                            {selectedNumbers.length > 0 ? `Cào ${selectedNumbers.length} chương` : 'Cào chương'}
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                            Thêm chương
                        </Button>
                    </Space>
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
                    <Tag style={{ marginInlineEnd: 0 }}>{stats?.total ?? 0} chương</Tag>
                    <StatPill
                        color={PILL_COLORS.crawl}
                        checked={crawlStatus === JobStatus.COMPLETED}
                        onChange={(checked) => updateFilters({ crawlStatus: checked ? JobStatus.COMPLETED : undefined })}
                    >
                        Crawl {stats?.crawled ?? 0}
                    </StatPill>
                    <StatPill
                        color={PILL_COLORS.tts}
                        checked={ttsStatus === JobStatus.COMPLETED}
                        onChange={(checked) => updateFilters({ ttsStatus: checked ? JobStatus.COMPLETED : undefined })}
                    >
                        TTS {stats?.ttsDone ?? 0}
                    </StatPill>
                    
                    <StatPill
                        color={PILL_COLORS.drive}
                        checked={onDrive === true}
                        onChange={(checked) => updateFilters({ onDrive: checked ? 'true' : undefined })}
                    >
                        Drive {driveDone ?? 0}
                    </StatPill>
                </Space>

                {jobHere && jobQuery.data ? (
                    <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
                        {jobQuery.data.progress.detail}
                    </Typography.Paragraph>
                ) : null}

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
                        rowSelection={{
                            selectedRowKeys: [...selectedChapters.keys()],
                            preserveSelectedRowKeys: true,
                            onChange: (keys, rows) => {
                                setSelectedChapters((current) => {
                                    const next = new Map<number, number>();
                                    const fromPage = new Map(rows.map((row) => [row.id, row.chapterNumber]));
                                    for (const key of keys) {
                                        const id = Number(key);
                                        const chapterNumber = fromPage.get(id) ?? current.get(id);
                                        if (chapterNumber != null) {
                                            next.set(id, chapterNumber);
                                        }
                                    }
                                    return next;
                                });
                            },
                        }}
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
                            onClick: (event) => {
                                const target = event.target as HTMLElement;
                                if (target.closest('a, button, .ant-checkbox, .ant-checkbox-wrapper')) {
                                    return;
                                }
                                navigate(`/novels/${novelId}/chapters/${chapter.id}`);
                            },
                        })}
                        scroll={{ x: 1000 }}
                    />
                )}
            </Card>

            <TtsRunModal
                key={runRequest ? `${runRequest.scope}:${runRequest.chapterRange}` : 'tts-run'}
                open={runRequest !== null}
                novelId={novelId}
                request={runRequest}
                onClose={() => setRunRequest(null)}
            />

            <UploadDriveDrawer
                key={driveRequest ? `${driveRequest.scope}:${driveRequest.chapterRange}` : 'drive-run'}
                open={driveRequest !== null}
                novelId={novelId}
                request={driveRequest}
                onClose={() => setDriveRequest(null)}
            />

            <ChapterFormModal
                open={formOpen}
                mode={editing ? 'edit' : 'create'}
                initial={
                    editing
                        ? {
                              chapterNumber: editingDetailQuery.data?.chapterNumber ?? editing.chapterNumber,
                              title: editingDetailQuery.data?.title ?? editing.title,
                              chapterSiteId: editingDetailQuery.data?.chapterSiteId ?? editing.chapterSiteId,
                              content: editingDetailQuery.data?.content,
                          }
                        : null
                }
                contentLoading={Boolean(editing) && editingDetailQuery.isLoading}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                onCancel={closeForm}
                onSubmit={handleSubmit}
            />
        </Space>
    );
}
