import { Form, Input, InputNumber, Modal } from 'antd';
import { useEffect } from 'react';
import type { ChapterListItem } from '@/features/chapters/api/chaptersApi.ts';

export type ChapterFormValues = {
    chapterNumber: number;
    title: string;
    chapterSiteId?: string;
    content?: string;
};

type ChapterFormModalProps = {
    open: boolean;
    chapter?: ChapterListItem | null;
    confirmLoading?: boolean;
    onCancel: () => void;
    onSubmit: (values: ChapterFormValues) => void;
};

export function ChapterFormModal({
    open,
    chapter,
    confirmLoading,
    onCancel,
    onSubmit,
}: ChapterFormModalProps) {
    const [form] = Form.useForm<ChapterFormValues>();
    const isEdit = Boolean(chapter);

    useEffect(() => {
        if (!open) {
            return;
        }
        if (chapter) {
            form.setFieldsValue({
                chapterNumber: chapter.chapterNumber,
                title: chapter.title,
                chapterSiteId: chapter.chapterSiteId,
                content: undefined,
            });
        } else {
            form.resetFields();
        }
    }, [open, chapter, form]);

    return (
        <Modal
            title={isEdit ? 'Sửa chương' : 'Thêm chương'}
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
                    name="chapterNumber"
                    label="Số chương"
                    rules={[{ required: true, message: 'Nhập số chương' }]}
                >
                    <InputNumber min={1} style={{ width: '100%' }} placeholder="1" />
                </Form.Item>
                <Form.Item name="title" label="Tiêu đề" rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
                    <Input placeholder="Chương 1: ..." />
                </Form.Item>
                <Form.Item
                    name="chapterSiteId"
                    label="Site ID"
                    tooltip="ID chương trên site nguồn. Bỏ trống khi thêm mới sẽ dùng số chương."
                >
                    <Input placeholder="Tùy chọn" />
                </Form.Item>
                {!isEdit ? (
                    <Form.Item name="content" label="Nội dung">
                        <Input.TextArea rows={6} placeholder="Tùy chọn — có thể để worker crawl sau" />
                    </Form.Item>
                ) : (
                    <Form.Item name="content" label="Nội dung" tooltip="Để trống nếu không muốn đổi nội dung.">
                        <Input.TextArea rows={6} placeholder="Tùy chọn — chỉ gửi khi muốn cập nhật" />
                    </Form.Item>
                )}
            </Form>
        </Modal>
    );
}
