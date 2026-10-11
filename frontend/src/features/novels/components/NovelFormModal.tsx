import { Alert, Button, Form, Input, Modal, Space, message } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { previewCrawlUrl, type CrawlPreview } from '@/features/crawl/api/crawlApi.ts';
import type { Novel, NovelListItem } from '@/features/novels/api/novelsApi.ts';
import { novelKeys } from '@/features/novels/hooks/useNovelsQuery.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

export type NovelFormValues = {
    url: string;
    title: string;
    author?: string;
    summary?: string;
    chapterRange?: string;
};

type NovelFormModalProps = {
    open: boolean;
    novel?: Novel | NovelListItem | null;
    confirmLoading?: boolean;
    onCancel: () => void;
    onSubmit: (values: NovelFormValues) => void;
};

function sameNovelUrl(left: string, right: string): boolean {
    const normalize = (value: string) => {
        const trimmed = value.trim();
        return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
    };
    return normalize(left) === normalize(right);
}

function chapterRangeIssue(value: string, maxAvailable?: number): string | null {
    const raw = value.trim();
    if (!raw || raw.toLowerCase() === 'all') {
        return null;
    }
    const numbers = new Set<number>();
    const segments = raw
        .split(',')
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
    if (segments.length === 0) {
        return 'Phạm vi không hợp lệ';
    }
    const singleNumber = segments.length === 1 && /^\d+$/.test(segments[0]) && !raw.includes('-');
    for (const segment of segments) {
        if (/^\d+$/.test(segment)) {
            const count = Number(segment);
            if (count <= 0) {
                return 'Số chương phải lớn hơn 0';
            }
            if (singleNumber) {
                for (let chapter = 1; chapter <= count; chapter += 1) {
                    numbers.add(chapter);
                }
            } else {
                numbers.add(count);
            }
            continue;
        }
        const match = /^(\d+)-(\d+)$/.exec(segment);
        if (!match) {
            return 'Dùng 10, 5-10, 1,2,5 hoặc all';
        }
        const start = Number(match[1]);
        const end = Number(match[2]);
        if (start <= 0 || end <= 0 || start > end) {
            return 'Khoảng chương không hợp lệ';
        }
        for (let chapter = start; chapter <= end; chapter += 1) {
            numbers.add(chapter);
        }
    }
    if (maxAvailable != null) {
        const tooFar = [...numbers].filter((chapter) => chapter > maxAvailable);
        if (tooFar.length > 0) {
            return `Chương vượt quá số chương miễn phí (${maxAvailable})`;
        }
    }
    return null;
}

export function NovelFormModal({ open, novel, confirmLoading, onCancel, onSubmit }: NovelFormModalProps) {
    const queryClient = useQueryClient();
    const [form] = Form.useForm<NovelFormValues>();
    const [reading, setReading] = useState(false);
    const [preview, setPreview] = useState<CrawlPreview | null>(null);
    const isEdit = Boolean(novel);
    const urlValue = Form.useWatch('url', form) ?? '';
    const chapterRange = Form.useWatch('chapterRange', form) ?? '';
    const matchedPreview = preview && sameNovelUrl(urlValue, preview.url) ? preview : null;

    useEffect(() => {
        if (!open) {
            setPreview(null);
            setReading(false);
            return;
        }
        if (novel) {
            form.setFieldsValue({
                url: novel.url,
                title: novel.title,
                author: novel.author ?? undefined,
                summary: novel.summary ?? undefined,
            });
        } else {
            form.resetFields();
        }
        setPreview(null);
    }, [open, novel, form]);

    const readFromUrl = async () => {
        try {
            const values = await form.validateFields(['url']);
            setReading(true);
            const data = await previewCrawlUrl(values.url.trim());
            const current = form.getFieldsValue();
            form.setFieldsValue({
                url: data.url,
                title: data.title || current.title,
                author: data.author || current.author,
                summary: data.summary || current.summary,
            });
            setPreview(data);
            void queryClient.invalidateQueries({ queryKey: novelKeys.lists() });
        } catch (error) {
            if (error && typeof error === 'object' && 'errorFields' in error) {
                return;
            }
            message.error(getErrorMessage(error, 'Không đọc được trang nguồn'));
        } finally {
            setReading(false);
        }
    };

    return (
        <Modal
            title={isEdit ? 'Sửa truyện' : 'Thêm truyện'}
            open={open}
            width={560}
            okText={isEdit ? 'Lưu' : chapterRange.trim() ? 'Thêm và mở cào' : 'Thêm'}
            cancelText="Hủy"
            confirmLoading={confirmLoading}
            okButtonProps={{ disabled: reading }}
            destroyOnHidden
            onCancel={onCancel}
            onOk={() => form.submit()}
        >
            <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark="optional">
                <Form.Item label="URL nguồn" required>
                    <Space.Compact style={{ width: '100%' }}>
                        <Form.Item
                            name="url"
                            noStyle
                            rules={[
                                { required: true, message: 'Nhập URL truyện' },
                                { type: 'url', message: 'URL không hợp lệ' },
                            ]}
                        >
                            <Input placeholder="https://sangtacviet.com/truyen/..." />
                        </Form.Item>
                        <Button loading={reading} onClick={() => void readFromUrl()}>
                            Đọc trang
                        </Button>
                    </Space.Compact>
                </Form.Item>
                {matchedPreview ? (
                    <Alert
                        type="success"
                        showIcon
                        style={{ marginBottom: 16 }}
                        title={`${matchedPreview.chapterCount} chương miễn phí`}
                        description={
                            matchedPreview.vipCount > 0
                                ? `Đã lưu ${matchedPreview.chapterCount} chương vào thư viện. Bỏ qua ${matchedPreview.vipCount} chương VIP.`
                                : `Đã lưu ${matchedPreview.chapterCount} chương vào thư viện. Cào sẽ lấy nội dung các chương này.`
                        }
                    />
                ) : null}
                <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
                    <Input placeholder="Tên truyện" />
                </Form.Item>
                <Form.Item name="author" label="Tác giả">
                    <Input placeholder="Tùy chọn" />
                </Form.Item>
                <Form.Item name="summary" label="Tóm tắt">
                    <Input.TextArea rows={4} placeholder="Tùy chọn" />
                </Form.Item>
                {isEdit ? null : (
                    <Form.Item
                        name="chapterRange"
                        label="Số chương muốn cào"
                        extra={
                            matchedPreview
                                ? `Trang nguồn có ${matchedPreview.chapterCount} chương miễn phí. Format giống tác vụ cào: 10 (chương 1–10), 5-10, 1,2,5, all. Sau khi thêm, drawer cào mở sẵn URL và phạm vi này.`
                                : 'Format giống tác vụ cào: 10 (chương 1–10), 5-10, 1,2,5, all. Sau khi thêm, drawer cào mở sẵn URL và phạm vi này.'
                        }
                        rules={[
                            {
                                validator: async (_, value: string | undefined) => {
                                    const issue = chapterRangeIssue(value ?? '', matchedPreview?.chapterCount);
                                    if (issue) {
                                        throw new Error(issue);
                                    }
                                },
                            },
                        ]}
                    >
                        <Input placeholder="1-20" />
                    </Form.Item>
                )}
            </Form>
        </Modal>
    );
}
