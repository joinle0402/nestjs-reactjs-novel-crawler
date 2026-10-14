import { UploadOutlined } from '@ant-design/icons';
import { Button, Drawer, Form, Input, Upload, message } from 'antd';
import { useEffect, useState } from 'react';
import { useCreateBgmTrackMutation } from '@/features/bgm/hooks/useBgmQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

type AddForm = {
    name: string;
};

type BgmCreateDrawerProps = {
    open: boolean;
    onClose: () => void;
};

export function BgmCreateDrawer({ open, onClose }: BgmCreateDrawerProps) {
    const [form] = Form.useForm<AddForm>();
    const [file, setFile] = useState<File | null>(null);
    const createMutation = useCreateBgmTrackMutation();

    useEffect(() => {
        if (!open) {
            return;
        }
        form.resetFields();
        setFile(null);
    }, [form, open]);

    const submit = async (values: AddForm) => {
        if (!file) {
            message.error('Chọn file audio');
            return;
        }
        const body = new FormData();
        body.append('name', values.name.trim());
        body.append('file', file);
        try {
            await createMutation.mutateAsync(body);
            message.success('Đã thêm nhạc nền');
            onClose();
        } catch (error) {
            message.error(getErrorMessage(error, 'Không thêm được nhạc nền'));
        }
    };

    return (
        <Drawer
            title="Thêm nhạc nền"
            placement="right"
            size={440}
            open={open}
            onClose={onClose}
            destroyOnHidden
            extra={
                <Button type="primary" loading={createMutation.isPending} onClick={() => form.submit()}>
                    Thêm nhạc nền
                </Button>
            }
        >
            <Form form={form} layout="vertical" onFinish={(values) => void submit(values)}>
                <Form.Item
                    name="name"
                    label="Tên"
                    rules={[
                        { required: true, whitespace: true, message: 'Nhập tên nhạc nền' },
                        { max: 80, message: 'Tối đa 80 ký tự' },
                    ]}
                >
                    <Input placeholder="Ví dụ: Mưa đêm" maxLength={80} />
                </Form.Item>
                <Form.Item label="File audio" required extra="mp3, wav, ogg, m4a, flac, aac hoặc webm. Tối đa 40 MB.">
                    <Upload
                        accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.aac,.webm"
                        maxCount={1}
                        beforeUpload={(next) => {
                            setFile(next);
                            return false;
                        }}
                        onRemove={() => {
                            setFile(null);
                        }}
                        fileList={file ? [{ uid: 'bgm-file', name: file.name, status: 'done' }] : []}
                    >
                        <Button icon={<UploadOutlined />}>Chọn file</Button>
                    </Upload>
                </Form.Item>
            </Form>
        </Drawer>
    );
}
