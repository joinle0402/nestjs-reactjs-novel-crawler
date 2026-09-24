import { Alert, Button, Card, Form, Input, Select, Space, Switch, Typography, message } from 'antd';
import { useEffect } from 'react';
import { useTtsSettingsQuery, useUpdateTtsSettingsMutation } from '@/features/tts/hooks/useTtsQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

type SettingsForm = {
    voice: string;
    rate: string;
    bgmEnabled: boolean;
};

export function TtsSettingsPage() {
    const [form] = Form.useForm<SettingsForm>();
    const settingsQuery = useTtsSettingsQuery();
    const updateMutation = useUpdateTtsSettingsMutation();

    useEffect(() => {
        if (!settingsQuery.data) {
            return;
        }
        form.setFieldsValue({
            voice: settingsQuery.data.voice,
            rate: settingsQuery.data.rate,
            bgmEnabled: settingsQuery.data.bgmEnabled,
        });
    }, [form, settingsQuery.data]);

    const onFinish = (values: SettingsForm) => {
        updateMutation.mutate(
            {
                engine: 'edge-tts',
                voice: values.voice,
                rate: values.rate.trim(),
                bgmEnabled: values.bgmEnabled,
            },
            {
                onSuccess: () => message.success('Đã lưu cài đặt TTS'),
                onError: (error) => message.error(getErrorMessage(error, 'Lưu cài đặt thất bại')),
            },
        );
    };

    return (
        <Card title="Cài đặt TTS" style={{ maxWidth: 560 }}>
            <Typography.Paragraph type="secondary">
                Mặc định cho lần tạo audio sau. Popup trên trang truyện có thể sửa riêng cho một lần chạy.
            </Typography.Paragraph>
            {settingsQuery.isError ? (
                <Alert type="error" showIcon title="Không tải được cài đặt" description={getErrorMessage(settingsQuery.error)} />
            ) : (
                <Form form={form} layout="vertical" onFinish={onFinish} disabled={settingsQuery.isLoading}>
                    <Form.Item label="Engine">
                        <Select value="edge-tts" options={[{ value: 'edge-tts', label: 'edge-tts' }]} />
                    </Form.Item>
                    <Form.Item name="voice" label="Giọng" rules={[{ required: true, message: 'Chọn giọng' }]}>
                        <Select
                            options={(settingsQuery.data?.voices ?? []).map((voice) => ({
                                value: voice.id,
                                label: voice.label,
                            }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name="rate"
                        label="Tốc độ"
                        extra="Ví dụ +50% (nhanh hơn), +0% (bình thường), -20% (chậm hơn)."
                        rules={[
                            { required: true, message: 'Nhập tốc độ' },
                            { pattern: /^[+-]\d+%$/, message: 'Dạng +50% hoặc -20%' },
                        ]}
                    >
                        <Input placeholder="+50%" />
                    </Form.Item>
                    <Form.Item name="bgmEnabled" label="Nhạc nền" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                    <Space>
                        <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
                            Lưu
                        </Button>
                    </Space>
                </Form>
            )}
        </Card>
    );
}
