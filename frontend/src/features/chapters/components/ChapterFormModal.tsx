import { Alert, Form, Input, InputNumber, Modal, Spin } from 'antd';
import { useEffect } from 'react';

export type ChapterFormValues = {
    chapterNumber: number;
    title: string;
    chapterSiteId?: string;
    content?: string;
};

export type ChapterFormInitial = {
    chapterNumber: number;
    title: string;
    chapterSiteId?: string;
    content?: string | null;
};

type ChapterFormModalProps = {
    open: boolean;
    mode: 'create' | 'edit';
    initial?: ChapterFormInitial | null;
    contentLoading?: boolean;
    confirmLoading?: boolean;
    onCancel: () => void;
    onSubmit: (values: ChapterFormValues) => void;
};

export function ChapterFormModal({
    open,
    mode,
    initial,
    contentLoading = false,
    confirmLoading,
    onCancel,
    onSubmit,
}: ChapterFormModalProps) {
    const [form] = Form.useForm<ChapterFormValues>();
    const isEdit = mode === 'edit';

    useEffect(() => {
        if (!open) {
            return;
        }
        if (isEdit) {
            if (contentLoading || !initial) {
                return;
            }
            form.setFieldsValue({
                chapterNumber: initial.chapterNumber,
                title: initial.title,
                chapterSiteId: initial.chapterSiteId,
                content: initial.content ?? '',
            });
            return;
        }
        form.resetFields();
    }, [
        open,
        isEdit,
        contentLoading,
        initial?.chapterNumber,
        initial?.title,
        initial?.chapterSiteId,
        initial?.content,
        form,
    ]);

    return (
        <Modal
            title={isEdit ? 'Sửa chương' : 'Thêm chương'}
            open={open}
            okText={isEdit ? 'Lưu' : 'Thêm'}
            cancelText="Hủy"
            confirmLoading={confirmLoading}
            okButtonProps={{ disabled: isEdit && contentLoading }}
            destroyOnHidden
            onCancel={onCancel}
            onOk={() => form.submit()}
        >
            {isEdit && contentLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
                    <Spin />
                </div>
            ) : (
                <Form form={form} layout="vertical" onFinish={onSubmit} requiredMark="optional">
                    {isEdit && !initial?.content ? (
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginBottom: 12 }}
                            title="Chương chưa có nội dung — có thể nhập tay tại đây."
                        />
                    ) : null}
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
                    <Form.Item name="content" label="Nội dung">
                        <Input.TextArea
                            rows={8}
                            placeholder={isEdit ? 'Nội dung chương' : 'Tùy chọn — có thể để worker crawl sau'}
                        />
                    </Form.Item>
                </Form>
            )}
        </Modal>
    );
}
