import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Input, Radio, Space, Typography, message } from 'antd';
import type { DriveScope } from '@/features/drive/api/driveApi.ts';
import {
    useCurrentDriveJobQuery,
    useDrivePreviewQuery,
    useDriveStatusQuery,
    useLastDriveJobQuery,
    useStartDriveJobMutation,
} from '@/features/drive/hooks/useDriveQueries.ts';
import { isActiveDriveJob } from '@/features/drive/api/driveApi.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';
import { formatChapterRangeInput } from '@/features/tts/lib/chapterRange.ts';

export type DriveRunRequest = {
    scope: DriveScope;
    chapterRange: string;
};

type DriveMode = 'missing' | 'chapters' | 'retry';

type UploadDriveDrawerProps = {
    open: boolean;
    novelId: number;
    request: DriveRunRequest | null;
    onClose: () => void;
};

function formatBytes(bytes: number): string {
    if (bytes >= 1024 * 1024 * 1024) {
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    }
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}

export function UploadDriveDrawer({ open, novelId, request, onClose }: UploadDriveDrawerProps) {
    const startMutation = useStartDriveJobMutation();
    const currentJobQuery = useCurrentDriveJobQuery();
    const [mode, setMode] = useState<DriveMode>(request?.scope === 'chapters' ? 'chapters' : 'missing');
    const [chapterRange, setChapterRange] = useState(request?.chapterRange ?? '');
    const [debouncedRange, setDebouncedRange] = useState(request?.chapterRange?.trim() ?? '');

    const statusQuery = useDriveStatusQuery(open);
    const countsQuery = useDrivePreviewQuery(open ? novelId : undefined);
    const rangeQuery = useDrivePreviewQuery(
        open && mode === 'chapters' ? novelId : undefined,
        mode === 'chapters' ? debouncedRange : undefined,
    );
    const lastJobQuery = useLastDriveJobQuery(open ? novelId : undefined, open);

    useEffect(() => {
        if (!open || !request) {
            return;
        }
        setMode(request.scope === 'chapters' ? 'chapters' : 'missing');
        setChapterRange(request.chapterRange);
        setDebouncedRange(request.chapterRange.trim());
    }, [open, request]);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedRange(chapterRange.trim()), 350);
        return () => window.clearTimeout(timer);
    }, [chapterRange]);

    const preview = countsQuery.data;
    const chapterPreview = mode === 'chapters' ? rangeQuery.data?.chapters : null;
    const status = statusQuery.data;
    const driveJob = currentJobQuery.data;
    const driveBusy = isActiveDriveJob(driveJob);
    const lastFailed = lastJobQuery.data?.failedFiles ?? [];
    const failedCount = lastFailed.length;
    const failedNumbers = lastFailed.map((file) => file.chapterNumber).filter((number) => number > 0);

    const rangeError =
        mode !== 'missing'
            ? !chapterRange.trim()
                ? 'Nhập phạm vi chương'
                : chapterPreview?.error
                  ? chapterPreview.error
                  : rangeQuery.isError
                    ? 'Không xem được phạm vi chương'
                    : null
            : null;

    const willRun = mode === 'missing' ? (preview ? (preview.missingOnDrive ?? preview.totalFiles) : 0) : (chapterPreview?.willRun ?? 0);
    const canStart =
        !driveBusy &&
        Boolean(status?.credentialsReady) &&
        !rangeError &&
        willRun > 0 &&
        (mode !== 'retry' || (failedCount > 0 && failedNumbers.length > 0)) &&
        !startMutation.isPending;

    const submit = async () => {
        const body =
            mode === 'missing'
                ? { novelId, scope: 'missing' as const }
                : {
                      novelId,
                      scope: 'chapters' as const,
                      chapterRange:
                          mode === 'retry' && !chapterRange.trim()
                              ? formatChapterRangeInput(failedNumbers)
                              : chapterRange.trim(),
                  };
        try {
            await startMutation.mutateAsync(body);
            message.success('Đã bắt đầu upload Drive');
            onClose();
        } catch (error) {
            message.error(getErrorMessage(error, 'Không bắt đầu được upload Drive'));
        }
    };

    const summary = (() => {
        if (!preview) {
            return null;
        }
        if (mode === 'missing') {
            if (preview.driveChecked) {
                return `Sẽ upload ${preview.missingOnDrive ?? 0} file · ${formatBytes(preview.missingBytes ?? 0)}`;
            }
            return `Sẽ upload ${preview.totalFiles} file · ${formatBytes(preview.totalBytes)} (file đã có trên Drive sẽ được bỏ qua)`;
        }
        if (mode === 'retry') {
            return `Sẽ chạy lại ${failedCount} file lỗi của lần upload trước`;
        }
        if (!chapterPreview || chapterPreview.error) {
            return null;
        }
        const missingInfo = chapterPreview.willRunMissing != null
            ? `${chapterPreview.willRunMissing} file thiếu trên Drive`
            : 'chưa kiểm tra được Drive';
        return `Sẽ xử lý ${chapterPreview.willRun} file · ${formatBytes(chapterPreview.willRunBytes)} · ${missingInfo}`;
    })();

    return (
        <Drawer
            open={open}
            title="Upload MP3 lên Google Drive"
            placement="right"
            width={480}
            destroyOnHidden
            onClose={onClose}
            footer={
                <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                    <Button onClick={onClose}>Hủy</Button>
                    <Button
                        type="primary"
                        loading={startMutation.isPending}
                        disabled={!canStart}
                        onClick={() => void submit()}
                    >
                        Bắt đầu upload
                    </Button>
                </Space>
            }
        >
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                {status && !status.credentialsReady ? (
                    <Alert
                        type="error"
                        showIcon
                        title="Thiếu file OAuth"
                        description="Không tìm thấy client_secret.json trong worker/. Tải credentials Desktop app từ Google Cloud Console rồi thử lại."
                    />
                ) : null}
                {driveBusy && driveJob ? (
                    <Alert
                        type="warning"
                        showIcon
                        title={driveJob.novelId === novelId ? 'Đang upload truyện này' : `Đang upload: ${driveJob.novelTitle}`}
                        description="Đợi job hiện tại xong hoặc dừng nó trước khi tạo job mới."
                    />
                ) : null}

                <div>
                    <Typography.Text strong>Phạm vi</Typography.Text>
                    <Radio.Group
                        style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
                        value={mode}
                        onChange={(event) => setMode(event.target.value as DriveMode)}
                    >
                        <Radio value="missing">
                            {preview?.driveChecked
                                ? `Chỉ thiếu trên Drive (${preview.missingOnDrive ?? 0})`
                                : `Tất cả MP3 (${preview?.totalFiles ?? 0})`}
                        </Radio>
                        {mode === 'missing' ? (
                            <Typography.Paragraph type="secondary" style={{ margin: '0 0 0 24px', fontSize: 12 }}>
                                File trùng tên trên Drive sẽ được bỏ qua.
                            </Typography.Paragraph>
                        ) : null}
                        <Radio value="chapters">Chọn chương</Radio>
                        {failedCount > 0 ? <Radio value="retry">Chạy lại {failedCount} file lỗi (lần trước)</Radio> : null}
                    </Radio.Group>
                    {mode !== 'missing' ? (
                        <div style={{ marginTop: 8 }}>
                            <Input
                                value={chapterRange}
                                placeholder="1-10, 15 hoặc 1,2,5"
                                onChange={(event) => setChapterRange(event.target.value)}
                                status={rangeError ? 'error' : undefined}
                            />
                            <Typography.Paragraph type="secondary" style={{ margin: '6px 0 0', fontSize: 12 }}>
                                Một số đơn như 10 nghĩa là chương 1–10. Muốn đúng một chương, ghi 10-10.
                            </Typography.Paragraph>
                            {rangeError ? (
                                <Typography.Text type="danger">{rangeError}</Typography.Text>
                            ) : chapterPreview?.preview ? (
                                <Typography.Text type="secondary">{chapterPreview.preview}</Typography.Text>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                {preview?.driveChecked && preview.driveFolder ? (
                    <div>
                        <Typography.Text strong>Đích</Typography.Text>
                        <Typography.Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
                            Drive / {preview.driveFolder}
                        </Typography.Paragraph>
                    </div>
                ) : null}

                {summary ? (
                    <Typography.Paragraph style={{ margin: 0 }}>
                        <Typography.Text strong>{summary}</Typography.Text>
                    </Typography.Paragraph>
                ) : null}
            </Space>
        </Drawer>
    );
}