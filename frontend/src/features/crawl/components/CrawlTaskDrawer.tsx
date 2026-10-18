import { Alert, Button, Drawer, Form, Input, Radio, Space, Typography, message } from 'antd';
import { useEffect } from 'react';
import type { CrawlScope, CreateCrawlJobBody } from '@/features/crawl/api/crawlApi.ts';
import { CHAPTER_SOURCE_LABEL } from '@/features/chapters/api/chaptersApi.ts';
import type { ChapterSource } from '@/features/chapters/api/chaptersApi.ts';
import { useCrawlLookupQuery, useCreateCrawlJobMutation, useUpdateCrawlJobMutation } from '@/features/crawl/hooks/useCrawlQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

export type CrawlTaskDraft = {
    mode: 'create' | 'edit' | 'clone';
    jobId?: number;
    novelId?: number;
    url: string;
    scope: CrawlScope;
    chapterRange: string;
    source?: ChapterSource;
};

type FormValues = {
    url: string;
    source: ChapterSource;
    scope: CrawlScope;
    chapterRange?: string;
};

const SOURCE_PLACEHOLDER: Record<ChapterSource, string> = {
    sangtacviet: 'https://sangtacviet.com/truyen/...',
    wikicv: 'https://wikicv.org/truyen/...',
};

const SOURCE_OPTIONS: ChapterSource[] = ['sangtacviet', 'wikicv'];

function detectUrlSource(url: string): ChapterSource | null {
    if (/sangtacviet\./i.test(url)) {
        return 'sangtacviet';
    }
    if (/wikicv\./i.test(url)) {
        return 'wikicv';
    }
    return null;
}

type CrawlTaskDrawerProps = {
    draft: CrawlTaskDraft | null;
    blocked: boolean;
    onClose: () => void;
    onSaved: (jobId: number) => void;
};

const TITLE: Record<CrawlTaskDraft['mode'], string> = {
    create: 'Thêm tác vụ cào',
    edit: 'Sửa tác vụ cào',
    clone: 'Clone tác vụ cào',
};

export function CrawlTaskDrawer({ draft, blocked, onClose, onSaved }: CrawlTaskDrawerProps) {
    const [form] = Form.useForm<FormValues>();
    const scope = Form.useWatch('scope', form) ?? draft?.scope ?? 'chapters';
    const url = Form.useWatch('url', form) ?? draft?.url ?? '';
    const source = Form.useWatch('source', form) ?? 'sangtacviet';
    const lookupQuery = useCrawlLookupQuery(url);
    const createMutation = useCreateCrawlJobMutation();
    const updateMutation = useUpdateCrawlJobMutation();
    const saving = createMutation.isPending || updateMutation.isPending;

    useEffect(() => {
        if (!draft) {
            return;
        }
        form.setFieldsValue({
            url: draft.url,
            source: draft.source ?? detectUrlSource(draft.url) ?? 'sangtacviet',
            scope: draft.scope || 'chapters',
            chapterRange: draft.chapterRange,
        });
    }, [draft, form]);

    const lookup = lookupQuery.data;
    const lookupError = lookupQuery.error ? getErrorMessage(lookupQuery.error, 'URL không hợp lệ') : null;
    const createBlocked = blocked && draft?.mode !== 'edit';

    const submit = (values: FormValues) => {
        if (!draft) {
            return;
        }
        const trimmedUrl = values.url.trim();
        const detected = detectUrlSource(trimmedUrl);
        if (detected && detected !== values.source) {
            message.error(`URL thuộc nguồn ${CHAPTER_SOURCE_LABEL[detected]}, không khớp nguồn đã chọn.`);
            return;
        }
        const body: CreateCrawlJobBody = {
            url: trimmedUrl,
            novelId: lookup?.novelId ?? draft.novelId,
            scope: values.scope,
            chapterRange: values.scope === 'chapters' ? values.chapterRange?.trim() : undefined,
        };
        if (draft.mode === 'edit' && draft.jobId) {
            updateMutation.mutate(
                { id: draft.jobId, body },
                {
                    onSuccess: (job) => {
                        message.success('Đã lưu tác vụ');
                        onSaved(job.id);
                    },
                    onError: (error) => message.error(getErrorMessage(error, 'Không sửa được tác vụ')),
                },
            );
            return;
        }
        createMutation.mutate(body, {
            onSuccess: (job) => {
                message.success(draft.mode === 'clone' ? 'Đã clone tác vụ' : 'Đã tạo tác vụ cào');
                onSaved(job.id);
            },
            onError: (error) => message.error(getErrorMessage(error, 'Không tạo được tác vụ')),
        });
    };

    return (
        <Drawer
            title={draft ? TITLE[draft.mode] : 'Tác vụ cào'}
            placement="right"
            size={440}
            open={draft !== null}
            onClose={onClose}
            destroyOnHidden
            extra={
                <Button type="primary" loading={saving} disabled={createBlocked} onClick={() => form.submit()}>
                    {draft?.mode === 'edit' ? 'Lưu' : draft?.mode === 'clone' ? 'Tạo bản sao' : 'Tạo tác vụ cào'}
                </Button>
            }
        >
            <Form form={form} layout="vertical" initialValues={{ scope: 'chapters', source: 'sangtacviet' }} onFinish={submit}>
                <Form.Item
                    name="source"
                    label="Nguồn cào"
                    rules={[{ required: true, message: 'Chọn nguồn' }]}
                    extra="Chương cào sẽ được gắn nguồn này. Dán URL của đúng nguồn."
                >
                    <Radio.Group optionType="button" buttonStyle="solid">
                        {SOURCE_OPTIONS.map((option) => (
                            <Radio.Button key={option} value={option}>
                                {CHAPTER_SOURCE_LABEL[option]}
                            </Radio.Button>
                        ))}
                    </Radio.Group>
                </Form.Item>
                <Form.Item name="url" label="URL truyện" rules={[{ required: true, message: 'Nhập URL' }]}>
                    <Input placeholder={SOURCE_PLACEHOLDER[source] ?? SOURCE_PLACEHOLDER.sangtacviet} />
                </Form.Item>
                {lookupError ? <Alert type="error" showIcon title={lookupError} style={{ marginBottom: 12 }} /> : null}
                {lookup ? (
                    <Alert
                        type={lookup.novelId ? 'success' : 'info'}
                        showIcon
                        style={{ marginBottom: 12 }}
                        title={lookup.novelId ? `Đã có trong thư viện: ${lookup.title}` : 'Truyện mới — worker sẽ tạo sau khi đọc được tên'}
                        description={lookup.novelId ? `${lookup.missing} chương chưa có nội dung, ${lookup.failed} chương lỗi, ${lookup.total} chương trong DB` : undefined}
                    />
                ) : null}
                {draft?.novelId && !lookup?.novelId ? (
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 12 }}
                        title={`Cào nối vào truyện #${draft.novelId}`}
                        description="Chương đã có nội dung (theo số chương) sẽ được bỏ qua; chương mới gắn nguồn đã chọn."
                    />
                ) : null}
                <Form.Item name="scope" label="Phạm vi chương">
                    <Radio.Group>
                        <Space orientation="vertical">
                            <Radio value="chapters">Cào theo khoảng chương</Radio>
                            <Radio value="missing">Cào chương chưa có nội dung</Radio>
                            <Radio value="failed" disabled={!lookup?.failed}>
                                Cào lại chương lỗi ({lookup?.failed ?? 0})
                            </Radio>
                            <Radio value="refresh" disabled={!lookup?.novelId}>
                                Cập nhật danh sách chương mới
                            </Radio>
                        </Space>
                    </Radio.Group>
                </Form.Item>
                {scope === 'chapters' ? (
                    <Form.Item
                        name="chapterRange"
                        label="Phạm vi"
                        extra="Cùng format console: 10 (chương 1–10), 5-10, 1,2,5, all"
                        rules={[{ required: true, message: 'Nhập phạm vi' }]}
                    >
                        <Input placeholder="1-20" />
                    </Form.Item>
                ) : null}
                {draft?.mode === 'edit' ? (
                    <Typography.Paragraph type="secondary">
                        Lưu chỉ đổi thông tin task này. Bấm Tiếp tục ở chi tiết task để chạy lại. Chương đã có nội dung sẽ được bỏ qua.
                    </Typography.Paragraph>
                ) : null}
                {draft?.mode === 'clone' ? (
                    <Typography.Paragraph type="secondary">Clone tạo task mới, không chạy tiếp task cũ.</Typography.Paragraph>
                ) : null}
                {createBlocked ? <Typography.Text type="secondary">Đang có task khác. Hủy task đó trước khi tạo mới.</Typography.Text> : null}
            </Form>
        </Drawer>
    );
}
