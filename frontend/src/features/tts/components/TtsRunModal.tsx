import { useEffect, useState } from 'react';
import { Form, Input, Modal, Radio, Select, Space, Switch, Typography, message } from 'antd';
import type { TtsScope } from '@/features/tts/api/ttsApi.ts';
import { useStartTtsJobMutation, useTtsPreviewQuery, useTtsSettingsQuery } from '@/features/tts/hooks/useTtsQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

export type TtsRunRequest = {
    scope: TtsScope;
    chapterRange: string;
};

type TtsRunModalProps = {
    open: boolean;
    novelId: number;
    request: TtsRunRequest | null;
    onClose: () => void;
};

export function TtsRunModal({ open, novelId, request, onClose }: TtsRunModalProps) {
    const settingsQuery = useTtsSettingsQuery();
    const startMutation = useStartTtsJobMutation();
    const [scope, setScope] = useState<TtsScope>(request?.scope ?? 'missing');
    const [chapterRange, setChapterRange] = useState(request?.chapterRange ?? '');
    const [debouncedRange, setDebouncedRange] = useState('');
    const [customize, setCustomize] = useState(false);
    const [engine, setEngine] = useState('edge-tts');
    const [voice, setVoice] = useState('');
    const [rate, setRate] = useState('+50%');
    const [bgmEnabled, setBgmEnabled] = useState(true);

    const countsQuery = useTtsPreviewQuery(open ? novelId : undefined);
    const rangeQuery = useTtsPreviewQuery(
        open && scope === 'chapters' ? novelId : undefined,
        scope === 'chapters' ? debouncedRange : undefined,
    );

    useEffect(() => {
        if (!open || !request) {
            return;
        }
        setScope(request.scope);
        setChapterRange(request.chapterRange);
        setDebouncedRange(request.chapterRange.trim());
        setCustomize(false);
    }, [open, request]);

    useEffect(() => {
        if (!settingsQuery.data || customize) {
            return;
        }
        setEngine(settingsQuery.data.engine || 'edge-tts');
        setVoice(settingsQuery.data.voice);
        setRate(settingsQuery.data.rate);
        setBgmEnabled(settingsQuery.data.bgmEnabled);
    }, [customize, settingsQuery.data]);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedRange(chapterRange.trim()), 350);
        return () => window.clearTimeout(timer);
    }, [chapterRange]);

    const missing = countsQuery.data?.missing ?? 0;
    const failed = countsQuery.data?.failed ?? 0;
    const chapterPreview = scope === 'chapters' ? rangeQuery.data?.chapters : null;
    const engines = settingsQuery.data?.engines ?? [];
    const selectedEngine = engines.find((item) => item.id === engine);
    const rateApplies = selectedEngine?.rateApplies !== false;
    const voiceOptions = (selectedEngine?.voices ?? settingsQuery.data?.voices ?? []).map((item) => ({
        value: item.id,
        label: item.label,
    }));
    const rateValid = !rateApplies || /^[+-]\d+%$/.test(rate.trim());
    const scopeWillRun = scope === 'missing' ? missing : scope === 'failed' ? failed : (chapterPreview?.willRun ?? 0);
    const rangeError =
        scope === 'chapters'
            ? !chapterRange.trim()
                ? 'Nhập phạm vi chương'
                : chapterPreview?.error
                  ? chapterPreview.error
                  : rangeQuery.isError
                    ? 'Không xem được phạm vi chương'
                    : null
            : null;
    const canStart =
        !rangeError &&
        scopeWillRun > 0 &&
        !startMutation.isPending &&
        (!customize || (rateValid && Boolean(voice)));

    const submit = async () => {
        try {
            await startMutation.mutateAsync({
                novelId,
                scope,
                ...(scope === 'chapters' ? { chapterRange: chapterRange.trim() } : {}),
                ...(customize
                    ? {
                          engine,
                          voice,
                          rate: rate.trim(),
                          bgmEnabled,
                      }
                    : {}),
            });
            message.success('Đã bắt đầu tạo audio');
            onClose();
        } catch (error) {
            message.error(getErrorMessage(error, 'Không bắt đầu được tạo audio'));
        }
    };

    return (
        <Modal
            open={open}
            title="Tạo audio"
            okText="Bắt đầu"
            cancelText="Hủy"
            onCancel={onClose}
            onOk={() => void submit()}
            confirmLoading={startMutation.isPending}
            okButtonProps={{ disabled: !canStart }}
            destroyOnHidden
            width={560}
        >
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
                <div>
                    <Typography.Text strong>Phạm vi</Typography.Text>
                    <Radio.Group
                        style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}
                        value={scope}
                        onChange={(event) => setScope(event.target.value as TtsScope)}
                    >
                        <Radio value="missing">Chương chưa có audio ({missing})</Radio>
                        {failed > 0 ? <Radio value="failed">Chương TTS lỗi ({failed})</Radio> : null}
                        <Radio value="chapters">Chọn chương</Radio>
                    </Radio.Group>
                    {scope === 'chapters' ? (
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

                <div>
                    <Space style={{ marginBottom: 8 }}>
                        <Switch checked={customize} onChange={setCustomize} />
                        <Typography.Text>Sửa cho lần này</Typography.Text>
                    </Space>
                    <Form layout="vertical" disabled={!customize} component={false}>
                        <Form.Item label="Engine" style={{ marginBottom: 8 }}>
                            <Select
                                value={engine}
                                options={engines.map((item) => ({
                                    value: item.id,
                                    label: item.label,
                                }))}
                                onChange={(next: string) => {
                                    setEngine(next);
                                    const found = engines.find((item) => item.id === next);
                                    const voices = found?.voices ?? [];
                                    if (!voices.some((item) => item.id === voice)) {
                                        setVoice(voices[0]?.id ?? '');
                                    }
                                }}
                            />
                        </Form.Item>
                        <Form.Item label="Giọng" style={{ marginBottom: 8 }}>
                            <Select value={voice || undefined} options={voiceOptions} onChange={setVoice} />
                        </Form.Item>
                        <Form.Item
                            label="Tốc độ"
                            style={{ marginBottom: 8 }}
                            validateStatus={customize && rateApplies && rate.trim() && !rateValid ? 'error' : undefined}
                            help={
                                !rateApplies
                                    ? 'VieNeu đọc theo nhịp của giọng.'
                                    : customize && rate.trim() && !rateValid
                                      ? 'Dạng +50% hoặc -20%'
                                      : undefined
                            }
                        >
                            <Input
                                value={rate}
                                placeholder="+50%"
                                disabled={!rateApplies}
                                onChange={(event) => setRate(event.target.value)}
                            />
                        </Form.Item>
                        <Form.Item label="Nhạc nền" style={{ marginBottom: 0 }}>
                            <Switch checked={bgmEnabled} onChange={setBgmEnabled} />
                        </Form.Item>
                    </Form>
                </div>
            </Space>
        </Modal>
    );
}
