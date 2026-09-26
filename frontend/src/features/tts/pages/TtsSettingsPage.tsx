import { SoundOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Select, Space, Switch, Typography, message } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { getSavedTtsSample } from '@/features/tts/api/ttsApi.ts';
import { useTtsSampleMutation, useTtsSettingsQuery, useUpdateTtsSettingsMutation } from '@/features/tts/hooks/useTtsQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

const DEFAULT_SAMPLE = 'Xin chào. Đây là đoạn thử giọng đọc. Nếu bạn nghe rõ câu này, giọng đã chọn đang hoạt động.';

async function sampleErrorMessage(error: unknown): Promise<string> {
    if (error instanceof Blob) {
        try {
            return getErrorMessage(JSON.parse(await error.text()) as unknown, 'Không tạo được mẫu giọng');
        } catch {
            return 'Không tạo được mẫu giọng';
        }
    }
    return getErrorMessage(error, 'Không tạo được mẫu giọng');
}

type SettingsForm = {
    engine: string;
    voice: string;
    rate: string;
    bgmEnabled: boolean;
};

export function TtsSettingsPage() {
    const [form] = Form.useForm<SettingsForm>();
    const settingsQuery = useTtsSettingsQuery();
    const updateMutation = useUpdateTtsSettingsMutation();
    const sampleMutation = useTtsSampleMutation();
    const [sampleText, setSampleText] = useState(DEFAULT_SAMPLE);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioUrlRef = useRef<string | null>(null);
    const playToken = useRef(0);

    useEffect(() => {
        if (!settingsQuery.data) {
            return;
        }
        form.setFieldsValue({
            engine: settingsQuery.data.engine,
            voice: settingsQuery.data.voice,
            rate: settingsQuery.data.rate,
            bgmEnabled: settingsQuery.data.bgmEnabled,
        });
    }, [form, settingsQuery.data]);

    useEffect(() => {
        return () => {
            if (audioUrlRef.current) {
                URL.revokeObjectURL(audioUrlRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!audioUrl) {
            return;
        }
        void audioRef.current?.play().catch(() => undefined);
    }, [audioUrl]);

    const onFinish = (values: SettingsForm) => {
        updateMutation.mutate(
            {
                engine: values.engine,
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

    const playBlob = (blob: Blob) => {
        if (blob.size < 100) {
            message.error('File mẫu rỗng');
            return;
        }
        if (audioUrlRef.current) {
            URL.revokeObjectURL(audioUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        audioUrlRef.current = url;
        setAudioUrl(url);
    };

    const savedRate = () => {
        const rateRaw = String(form.getFieldValue('rate') ?? '').trim();
        return /^[+-]\d+%$/.test(rateRaw) ? rateRaw : '+0%';
    };

    const playSaved = async (engineId: string, voiceId: string, rate: string) => {
        if (sampleText.trim() !== DEFAULT_SAMPLE || !engineId || !voiceId) {
            return;
        }
        const token = ++playToken.current;
        audioRef.current?.pause();
        const blob = await getSavedTtsSample({ engine: engineId, voice: voiceId, rate });
        if (token !== playToken.current || !blob) {
            return;
        }
        playBlob(blob);
    };

    const onSample = async () => {
        const engineId = form.getFieldValue('engine') as string | undefined;
        const engineMeta = (settingsQuery.data?.engines ?? []).find((item) => item.id === engineId);
        try {
            await form.validateFields(engineMeta?.rateApplies === false ? ['engine', 'voice'] : ['engine', 'voice', 'rate']);
        } catch {
            return;
        }
        const text = sampleText.trim();
        if (!text) {
            message.warning('Nhập câu để nghe thử');
            return;
        }
        audioRef.current?.pause();
        const token = ++playToken.current;
        const rate = savedRate();
        sampleMutation.mutate(
            {
                engine: form.getFieldValue('engine') as string,
                voice: form.getFieldValue('voice') as string,
                rate,
                text,
            },
            {
                onSuccess: (blob) => {
                    if (token !== playToken.current || !(blob instanceof Blob)) {
                        return;
                    }
                    playBlob(blob);
                },
                onError: (error) => {
                    void sampleErrorMessage(error).then((detail) => message.error(detail));
                },
            },
        );
    };

    const engines = settingsQuery.data?.engines ?? [];
    const engine = Form.useWatch('engine', form) || settingsQuery.data?.engine;
    const selectedEngine = engines.find((item) => item.id === engine);
    const rateApplies = selectedEngine?.rateApplies !== false;
    const voiceOptions = (selectedEngine?.voices ?? settingsQuery.data?.voices ?? []).map((voice) => ({
        value: voice.id,
        label: voice.label,
    }));

    return (
        <Card title="Cài đặt TTS" style={{ maxWidth: 640 }}>
            <Typography.Paragraph type="secondary">
                Mặc định cho lần tạo audio sau. Popup trên trang truyện có thể sửa riêng cho một lần chạy.
                VieNeu chạy offline trên máy này; lần đầu tải model có thể mất vài phút.
            </Typography.Paragraph>
            {settingsQuery.isError ? (
                <Alert type="error" showIcon title="Không tải được cài đặt" description={getErrorMessage(settingsQuery.error)} />
            ) : (
                <Form form={form} layout="vertical" onFinish={onFinish} disabled={settingsQuery.isLoading}>
                    <Form.Item name="engine" label="Engine" rules={[{ required: true, message: 'Chọn engine' }]}>
                        <Select
                            options={engines.map((item) => ({ value: item.id, label: item.label }))}
                            onChange={(next: string) => {
                                const found = engines.find((item) => item.id === next);
                                const voices = found?.voices ?? [];
                                let voiceId = form.getFieldValue('voice') as string | undefined;
                                if (!voices.some((voice) => voice.id === voiceId)) {
                                    voiceId = voices[0]?.id;
                                    form.setFieldValue('voice', voiceId);
                                }
                                if (voiceId) {
                                    void playSaved(next, voiceId, savedRate());
                                }
                            }}
                        />
                    </Form.Item>
                    <Form.Item name="voice" label="Giọng" rules={[{ required: true, message: 'Chọn giọng' }]}>
                        <Select
                            options={voiceOptions}
                            onChange={(next: string) => {
                                const engineId = form.getFieldValue('engine') as string | undefined;
                                if (engineId) {
                                    void playSaved(engineId, next, savedRate());
                                }
                            }}
                        />
                    </Form.Item>
                    <Form.Item
                        name="rate"
                        label="Tốc độ"
                        extra={
                            rateApplies
                                ? 'Ví dụ +50% (nhanh hơn), +0% (bình thường), -20% (chậm hơn).'
                                : 'VieNeu đọc theo nhịp của giọng. Giá trị này chỉ có tác dụng khi chuyển lại edge-tts.'
                        }
                        rules={[
                            { required: true, message: 'Nhập tốc độ' },
                            { pattern: /^[+-]\d+%$/, message: 'Dạng +50% hoặc -20%' },
                        ]}
                    >
                        <Input placeholder="+50%" disabled={!rateApplies} />
                    </Form.Item>
                    <Form.Item name="bgmEnabled" label="Nhạc nền" valuePropName="checked">
                        <Switch />
                    </Form.Item>
                    <Form.Item
                        label="Thử giọng"
                        extra={
                            sampleText.trim() === DEFAULT_SAMPLE
                                ? 'Đúng câu này thì phát file đã lưu trên máy theo giọng đang chọn, không tạo lại. Đổi giọng là nghe ngay.'
                                : 'Câu khác câu mẫu sẽ tạo audio mới mỗi lần nghe thử, không trộn nhạc nền.'
                        }
                    >
                        <Input.TextArea
                            value={sampleText}
                            onChange={(event) => setSampleText(event.target.value)}
                            maxLength={500}
                            showCount
                            rows={3}
                        />
                    </Form.Item>
                    <Space>
                        <Button type="primary" htmlType="submit" loading={updateMutation.isPending}>
                            Lưu
                        </Button>
                        <Button htmlType="button" icon={<SoundOutlined />} loading={sampleMutation.isPending} onClick={() => void onSample()}>
                            Nghe thử
                        </Button>
                    </Space>
                    {sampleMutation.isPending ? (
                        <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                            {sampleText.trim() === DEFAULT_SAMPLE
                                ? 'Đang mở mẫu đã lưu...'
                                : engine === 'vieneu'
                                  ? 'Đang tạo mẫu. VieNeu có thể cần vài phút nếu model chưa sẵn sàng.'
                                  : 'Đang tạo mẫu...'}
                        </Typography.Paragraph>
                    ) : null}
                    {audioUrl ? (
                        <audio key={audioUrl} ref={audioRef} controls src={audioUrl} style={{ width: '100%', marginTop: 12 }} />
                    ) : null}
                </Form>
            )}
        </Card>
    );
}
