import { Form, Input, Modal } from 'antd';
import { useEffect } from 'react';
import type { Novel, NovelListItem } from '@/features/novels/api/novelsApi.ts';

export type NovelFormValues = {
    url: string;
    title: string;
    author?: string;
    summary?: string;
};

type NovelFormModalProps = {
    open: boolean;
    novel?: Novel | NovelListItem | null;
    confirmLoading?: boolean;
    onCancel: () => void;
    onSubmit: (values: NovelFormValues) => void;
};

export function NovelFormModal({ open, novel, confirmLoading, onCancel, onSubmit }: NovelFormModalProps) {
    const [form] = Form.useForm<NovelFormValues>();
    const isEdit = Boolean(novel);

    useEffect(() => {
        if (!open) {
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
    }, [open, novel, form]);

    return (
        <Modal
            title={isEdit ? 'Sửa truyện' : 'Thêm truyện'}
            open={open}
            okText={isEdit ? 'Lưu' : 'Thêm'}
            cancelText="Hủy"
            confirmLoading={confirmLoading}
            destroyOnHidden
            onCancel={onCancel}
            onOk={() => form.submit()}
        >
            <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark="optional">
                <Form.Item
                    name="url"
                    label="URL nguồn"
                    rules={[
                        { required: true, message: 'Nhập URL truyện' },
                        { type: 'url', message: 'URL không hợp lệ' },
                    ]}
                >
                    <Input placeholder="https://..." />
                </Form.Item>
                <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
                    <Input placeholder="Tên truyện" />
                </Form.Item>
                <Form.Item name="author" label="Tác giả">
                    <Input placeholder="Tùy chọn" />
                </Form.Item>
                <Form.Item name="summary" label="Tóm tắt">
                    <Input.TextArea rows={4} placeholder="Tùy chọn" />
                </Form.Item>
            </Form>
        </Modal>
    );
}
