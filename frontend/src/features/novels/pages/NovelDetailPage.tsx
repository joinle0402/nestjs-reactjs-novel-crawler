import {
    Alert,
    Breadcrumb,
    Button,
    Card,
    Empty,
    Input,
    Modal,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Typography,
    message,
    theme,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CaretRightOutlined, CloudDownloadOutlined, CloudSyncOutlined, CloudUploadOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SoundOutlined } from '@ant-design/icons';
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
import type { ChapterListItem, ChapterSource, ListChaptersParams } from '@/features/chapters/api/chaptersApi.ts';
import { CHAPTER_SOURCE_LABEL, chapterSourceColor } from '@/features/chapters/api/chaptersApi.ts';
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
import { useCurrentDriveJobQuery, useDrivePreviewQuery, useSyncDrivePreviewMutation } from '@/features/drive/hooks/useDriveQueries.ts';
import { ListPagination } from '@/shared/ui/ListPagination.tsx';
import { isRowActionTarget, pageLimitParam, parsePageLimit } from '@/shared/ui/listPagination.ts';
import { fitTableScroll, useTableScrollFit } from '@/shared/ui/useTableScrollFit.ts';

const { CheckableTag } = Tag;

/** `crawl` đổi theo accent người dùng chọn; tts/drive giữ màu đặc trưng riêng. */
const PILL_COLORS = (colorPrimary: string) => ({
    crawl: colorPrimary,
    tts: '#722ed1',
    drive: '#52c41a',
});

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
    const { token } = theme.useToken();
    const pillColors = PILL_COLORS(token.colorPrimary);
    const { novelId: novelIdParam } = useParams();
    const novelId = parseRouteId(novelIdParam);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { playChapter, track, status } = useAudioPlayer();
    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState<ChapterListItem | null>(null);
    const [selectedChapters, setSelectedChapters] = useState<Map<number, ChapterListItem>>(new Map());
    const [runRequest, setRunRequest] = useState<TtsRunRequest | null>(null);
    const [driveRequest, setDriveRequest] = useState<DriveRunRequest | null>(null);
    const { areaRef, bodyHeight } = useTableScrollFit();

    const createMutation = useCreateChapterMutation();
    const crawlMutation = useCreateCrawlJobMutation();
    const crawlQuery = useCurrentCrawlJobQuery();
    const crawlActive = isActiveCrawlJob(crawlQuery.data);
    const driveQuery = useCurrentDriveJobQuery();
    const driveActive = isActiveDriveJob(driveQuery.data);
    const drivePreviewQuery = useDrivePreviewQuery(novelId);
    const syncDriveMutation = useSyncDrivePreviewMutation();
    const updateMutation = useUpdateChapterMutation();
    const deleteMutation = useDeleteChapterMutation();

    const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
    const limit = parsePageLimit(searchParams.get('limit'));
    const focusChapterId = parseRouteId(searchParams.get('focusChapterId') ?? undefined);
    const q = searchParams.get('q') ?? '';
    const [titleQuery, setTitleQuery] = useState(q);
    const [trackedQ, setTrackedQ] = useState(q);
    if (trackedQ !== q) {
        setTrackedQ(q);
        setTitleQuery(q);
    }
    const crawlStatus = readStatusParam(searchParams.get('crawlStatus'));
    const ttsStatus = readStatusParam(searchParams.get('ttsStatus'));
    const onDrive = readBooleanParam(searchParams.get('onDrive'));

    const chapterParams: ListChaptersParams = useMemo(
        () => ({
            page,
            limit,
            q: q.trim() || undefined,
            crawlStatus,
            ttsStatus,
            onDrive,
            focusChapterId,
        }),
        [page, limit, q, crawlStatus, ttsStatus, onDrive, focusChapterId],
    );
    const driveChecked = drivePreviewQuery.data?.driveChecked ?? false;
    const driveFolderId = drivePreviewQuery.data?.driveFolderId ?? null;
    const driveExistingNames = useMemo(
        () => new Set(drivePreviewQuery.data?.existingNames ?? []),
        [drivePreviewQuery.data],
    );
    const jobOnDriveNumbers = useMemo(() => {
        const job = driveQuery.data;
        if (!job || job.novelId !== novelId) {
            return new Set<number>();
        }
        return new Set(
            job.fileResults
                .filter((file) => file.status === 'uploaded' || file.status === 'skipped')
                .map((file) => file.chapterNumber)
                .filter((number) => number > 0),
        );
    }, [driveQuery.data, novelId]);
    const jobOnDriveNames = useMemo(() => {
        const job = driveQuery.data;
        if (!job || job.novelId !== novelId) {
            return new Set<string>();
        }
        return new Set(
            job.fileResults
                .filter((file) => file.status === 'uploaded' || file.status === 'skipped')
                .map((file) => file.name)
                .filter((name) => name.length > 0),
        );
    }, [driveQuery.data, novelId]);
    const isOnDrive = (chapter: ChapterListItem) => {
        if (jobOnDriveNumbers.has(chapter.chapterNumber)) {
            return true;
        }
        if (!chapter.hasMp3 || !chapter.mp3Path) {
            return false;
        }
        const name = baseName(chapter.mp3Path);
        if (jobOnDriveNames.has(name)) {
            return true;
        }
        return driveChecked && driveExistingNames.has(name);
    };
    const driveDone = useMemo(() => {
        const preview = drivePreviewQuery.data;
        const fromPreview = preview?.driveChecked && preview.missingOnDrive != null ? Math.max(0, preview.totalFiles - preview.missingOnDrive) : null;
        const job = driveQuery.data;
        if (job?.novelId === novelId) {
            const live = (job?.progress.done ?? 0) + (job?.progress.skipped ?? 0);
            const merged = Math.max(fromPreview ?? 0, live, jobOnDriveNumbers.size);
            return preview?.totalFiles != null ? Math.min(preview.totalFiles, merged) : merged;
        }
        return fromPreview ?? 0;
    }, [drivePreviewQuery.data, driveQuery.data, jobOnDriveNumbers.size, novelId]);
    const hasOnDrive = (drivePreviewQuery.data?.existingNames?.length ?? 0) > 0 || jobOnDriveNumbers.size > 0 || jobOnDriveNames.size > 0;

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

    useEffect(() => {
        const trimmed = titleQuery.trim();
        if (trimmed === q) {
            return;
        }
        const timer = window.setTimeout(() => {
            setSearchParams((prev) => {
                const next = new URLSearchParams(prev);
                if (trimmed) {
                    next.set('q', trimmed);
                } else {
                    next.delete('q');
                }
                next.delete('page');
                next.delete('focusChapterId');
                return next;
            });
        }, 300);
        return () => window.clearTimeout(timer);
    }, [q, setSearchParams, titleQuery]);

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
        if (Object.keys(patch).some((key) => key !== 'limit')) {
            next.delete('focusChapterId');
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
            title: 'Nguồn',
            dataIndex: 'source',
            width: 110,
            render: (source: ChapterSource) => (
                <Tag color={chapterSourceColor(source)} style={{ marginInlineEnd: 0 }}>
                    {CHAPTER_SOURCE_LABEL[source] ?? source}
                </Tag>
            ),
        },
        {
            title: 'Chương',
            dataIndex: 'title',
            ellipsis: true,
            render: (title: string, chapter) => (
                <Link className="chapter-title-link" to={`/novels/${novelId}/chapters/${chapter.id}`}>
                    {title}
                </Link>
            ),
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
            render: (_, chapter) => (
                <JobStatusTag status={isOnDrive(chapter) ? JobStatus.COMPLETED : JobStatus.PENDING} />
            ),
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
    const boundaryNumber = stats?.lastCrawled ?? null;
    const totalChapters = stats?.total ?? 0;
    const missing = previewQuery.data?.missing ?? 0;
    const failed = previewQuery.data?.failed ?? 0;
    const selectedList = [...selectedChapters.values()];
    const numbersOf = (list: ChapterListItem[]) =>
        list.map((chapter) => chapter.chapterNumber).sort((a, b) => a - b);
    const crawlNumbers = numbersOf(selectedList.filter((chapter) => chapter.crawlStatus !== JobStatus.COMPLETED));
    const ttsNumbers = numbersOf(
        selectedList.filter((chapter) => chapter.crawlStatus === JobStatus.COMPLETED && !chapter.hasMp3),
    );
    const driveNumbers = numbersOf(selectedList.filter((chapter) => chapter.hasMp3 && !isOnDrive(chapter)));

    const ttsAction = (() => {
        if (selectedChapters.size > 0) {
            return {
                label: `Tạo audio (${ttsNumbers.length})`,
                disabled: ttsNumbers.length === 0,
                request:
                    ttsNumbers.length > 0
                        ? { scope: 'chapters' as const, chapterRange: formatChapterRangeInput(ttsNumbers) }
                        : null,
            };
        }
        if (!previewQuery.data) {
            return null;
        }
        if (missing > 0 && failed !== missing) {
            return { label: 'Tạo audio', disabled: false, request: { scope: 'missing' as const, chapterRange: '' } };
        }
        if (failed > 0) {
            return { label: 'Chạy lại lỗi', disabled: false, request: { scope: 'failed' as const, chapterRange: '' } };
        }
        return null;
    })();

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
            <Breadcrumb
                items={[
                    { title: <Link to="/">Dashboard</Link> },
                    { title: <Link to="/novels">Danh sách truyện</Link> },
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
                                <>
                                    {' '}
                                    <Typography.Link
                                        href={`https://drive.google.com/drive/folders/${driveFolderId}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{ fontWeight: 'normal', fontSize: 13 }}
                                    >
                                        (Drive)
                                    </Typography.Link>
                                </>
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
                                disabled={jobActive || ttsAction.disabled}
                                onClick={() => {
                                    if (ttsAction.request) {
                                        setRunRequest(ttsAction.request);
                                    }
                                }}
                            >
                                {ttsAction.label}
                            </Button>
                        ) : null}
                        <Button
                            icon={<CloudUploadOutlined />}
                            disabled={driveActive || (selectedChapters.size > 0 && driveNumbers.length === 0)}
                            title={driveActive ? 'Đang có job upload Drive' : 'Upload MP3 lên Google Drive'}
                            onClick={() => {
                                if (driveNumbers.length > 0) {
                                    setDriveRequest({ scope: 'chapters', chapterRange: formatChapterRangeInput(driveNumbers) });
                                    return;
                                }
                                if (selectedChapters.size === 0) {
                                    setDriveRequest({ scope: 'missing', chapterRange: '' });
                                }
                            }}
                        >
                            {selectedChapters.size > 0 ? `Upload Drive (${driveNumbers.length})` : 'Upload Drive'}
                        </Button>
                        <Button
                            icon={<CloudSyncOutlined />}
                            loading={syncDriveMutation.isPending}
                            title="Đồng bộ trạng thái Drive (khi upload tay hoặc trạng thái lệch)"
                            onClick={() =>
                                syncDriveMutation.mutate(novel.id, {
                                    onSuccess: (preview) => {
                                        if (!preview.driveChecked) {
                                            message.warning('Không kiểm tra được Drive. Kiểm tra token/credentials trong worker.');
                                            return;
                                        }
                                        const done =
                                            preview.missingOnDrive != null
                                                ? Math.max(0, preview.totalFiles - preview.missingOnDrive)
                                                : (preview.existingNames?.length ?? 0);
                                        message.success(`Đã đồng bộ Drive: ${done} file trên Drive`);
                                    },
                                    onError: (error) => message.error(getErrorMessage(error, 'Không đồng bộ được Drive')),
                                })
                            }
                        >
                            Đồng bộ Drive
                        </Button>
                        <Button
                            icon={<CloudDownloadOutlined />}
                            loading={crawlMutation.isPending}
                            disabled={crawlActive || (selectedChapters.size > 0 && crawlNumbers.length === 0)}
                            title={crawlActive ? 'Đang có tác vụ cào khác' : undefined}
                            onClick={() => {
                                if (selectedChapters.size === 0) {
                                    navigate(`/crawl?novelId=${novel.id}`);
                                    return;
                                }
                                if (crawlNumbers.length === 0) {
                                    return;
                                }
                                const chapterRange = formatChapterRangeInput(crawlNumbers);
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
                            {selectedChapters.size > 0 ? `Cào ${crawlNumbers.length} chương` : 'Cào chương'}
                        </Button>
                        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                            Thêm chương
                        </Button>
                    </Space>
                }
            >
                <Space wrap style={{ marginBottom: 12 }}>
                    <Input.Search
                        allowClear
                        placeholder="Lọc theo tên chương"
                        style={{ width: 220 }}
                        value={titleQuery}
                        maxLength={200}
                        onChange={(event) => setTitleQuery(event.target.value)}
                    />
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
                        color={pillColors.crawl}
                        checked={crawlStatus === JobStatus.COMPLETED}
                        onChange={(checked) => updateFilters({ crawlStatus: checked ? JobStatus.COMPLETED : undefined })}
                    >
                        Crawl {stats?.crawled ?? 0}
                    </StatPill>
                    <StatPill
                        color={pillColors.tts}
                        checked={ttsStatus === JobStatus.COMPLETED}
                        onChange={(checked) => updateFilters({ ttsStatus: checked ? JobStatus.COMPLETED : undefined })}
                    >
                        TTS {stats?.ttsDone ?? 0}
                    </StatPill>
                    
                    <StatPill
                        color={pillColors.drive}
                        checked={onDrive === true}
                        onChange={(checked) => updateFilters({ onDrive: checked ? 'true' : undefined })}
                    >
                        Drive {driveDone}
                    </StatPill>
                </Space>

                {boundaryNumber != null && totalChapters > boundaryNumber ? (
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                        message={`Cào dừng tại chương ${boundaryNumber}/${totalChapters}`}
                        description="Chương phía trên đã có nội dung. Muốn cào tiếp từ nguồn khác, mở drawer cào và chọn nguồn WikiCV rồi dán URL truyện tương ứng."
                        action={
                            <Button
                                size="small"
                                type="primary"
                                disabled={crawlActive}
                                onClick={() =>
                                    navigate(`/crawl?novelId=${novel.id}&chapterRange=${boundaryNumber + 1}-`)
                                }
                            >
                                Cào tiếp
                            </Button>
                        }
                    />
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
                    <div ref={areaRef}>
                        <Table<ChapterListItem>
                            rowKey="id"
                            size="small"
                            columns={columns}
                            dataSource={chaptersQuery.data?.data}
                            loading={chaptersQuery.isFetching}
                            rowClassName={(chapter) =>
                                boundaryNumber != null && chapter.chapterNumber === boundaryNumber
                                    ? 'chapter-boundary-row'
                                    : ''
                            }
                            rowSelection={{
                                selectedRowKeys: [...selectedChapters.keys()],
                                preserveSelectedRowKeys: true,
                                onChange: (keys, rows) => {
                                    setSelectedChapters((current) => {
                                        const next = new Map<number, ChapterListItem>();
                                        const fromPage = new Map(rows.map((row) => [row.id, row]));
                                        for (const key of keys) {
                                            const id = Number(key);
                                            const chapter = fromPage.get(id) ?? current.get(id);
                                            if (chapter != null) {
                                                next.set(id, chapter);
                                            }
                                        }
                                        return next;
                                    });
                                },
                            }}
                            pagination={false}
                            onRow={(chapter) => ({
                                style: { cursor: 'pointer' },
                                onClick: (event) => {
                                    if (isRowActionTarget(event.target)) {
                                        return;
                                    }
                                    setSelectedChapters((current) => {
                                        const next = new Map(current);
                                        if (next.has(chapter.id)) {
                                            next.delete(chapter.id);
                                        } else {
                                            next.set(chapter.id, chapter);
                                        }
                                        return next;
                                    });
                                },
                            })}
                            scroll={fitTableScroll(1000, bodyHeight)}
                        />
                        <ListPagination
                            current={chaptersQuery.data?.meta.page ?? page}
                            pageSize={limit}
                            total={chaptersQuery.data?.meta.total ?? 0}
                            totalLabel={(total) => `${total} chương`}
                            onChange={(nextPage, nextSize) => {
                                if (nextSize !== limit) {
                                    updateFilters({ limit: pageLimitParam(nextSize) });
                                    return;
                                }
                                updateFilters({ page: nextPage > 1 ? String(nextPage) : undefined });
                            }}
                        />
                    </div>
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
