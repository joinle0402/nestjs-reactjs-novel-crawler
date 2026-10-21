import { useEffect } from 'react';
import { Alert, Button, Checkbox, Divider, Drawer, Form, Input, Select, Space, Switch, Typography, message } from 'antd';
import {
    ALL_DAYS,
    DAY_OF_WEEK_LABEL,
    DAY_OF_WEEK_ORDER,
    WEEKDAYS,
    WEEKEND,
    type Schedule,
} from '@/features/schedules/api/schedulesApi.ts';
import { useCreateScheduleMutation, useUpdateScheduleMutation } from '@/features/schedules/hooks/useScheduleQueries.ts';
import { useNovelsQuery } from '@/features/novels/hooks/useNovelsQuery.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

type ScheduleFormValues = {
    novelId: number;
    daysOfWeek: number[];
    timeOfDay: string;
    autoCrawl: boolean;
    autoTts: boolean;
    autoDrive: boolean;
    active: boolean;
};

type ScheduleFormDrawerProps = {
    open: boolean;
    schedule: Schedule | null;
    onClose: () => void;
    onSaved?: (schedule: Schedule) => void;
};

const DEFAULT_VALUES: ScheduleFormValues = {
    novelId: 0,
    daysOfWeek: ALL_DAYS,
    timeOfDay: '08:00',
    autoCrawl: true,
    autoTts: true,
    autoDrive: true,
    active: true,
};

const DAY_OPTIONS = DAY_OF_WEEK_ORDER.map((day) => ({
    value: day,
    label: DAY_OF_WEEK_LABEL[day],
}));

export function ScheduleFormDrawer({ open, schedule, onClose, onSaved }: ScheduleFormDrawerProps) {
    const [form] = Form.useForm<ScheduleFormValues>();
    const novelsQuery = useNovelsQuery();
    const createMutation = useCreateScheduleMutation();
    const updateMutation = useUpdateScheduleMutation();
    const isEdit = Boolean(schedule);
    const saving = createMutation.isPending || updateMutation.isPending;

    useEffect(() => {
        if (!open) {
            return;
        }
        if (schedule) {
            form.setFieldsValue({
                novelId: schedule.novelId,
                daysOfWeek: schedule.daysOfWeek,
                timeOfDay: schedule.timeOfDay,
                autoCrawl: schedule.autoCrawl,
                autoTts: schedule.autoTts,
                autoDrive: schedule.autoDrive,
                active: schedule.active,
            });
        } else {
            form.setFieldsValue(DEFAULT_VALUES);
        }
    }, [form, open, schedule]);

    const submit = async (values: ScheduleFormValues) => {
        const body = {
            novelId: Number(values.novelId),
            daysOfWeek: [...values.daysOfWeek].sort((left, right) => left - right),
            timeOfDay: values.timeOfDay.slice(0, 5),
            autoCrawl: values.autoCrawl,
            autoTts: values.autoTts,
            autoDrive: values.autoDrive,
            active: values.active,
        };
        try {
            const saved = isEdit && schedule
                ? await updateMutation.mutateAsync({ id: schedule.id, body })
                : await createMutation.mutateAsync(body);
            message.success(isEdit ? 'Đã lưu lịch định kỳ' : 'Đã thêm lịch định kỳ');
            onSaved?.(saved);
            onClose();
        } catch (error) {
            message.error(getErrorMessage(error, isEdit ? 'Không lưu được lịch' : 'Không thêm được lịch'));
        }
    };

    const novels = novelsQuery.data ?? [];

    return (
        <Drawer
            title={isEdit ? 'Sửa lịch định kỳ' : 'Thêm lịch định kỳ'}
            placement="right"
            size={520}
            open={open}
            destroyOnHidden
            onClose={onClose}
            footer={
                <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                    <Button onClick={onClose}>Hủy</Button>
                    <Button type="primary" loading={saving} onClick={() => form.submit()}>
                        {isEdit ? 'Lưu' : 'Thêm lịch'}
                    </Button>
                </Space>
            }
        >
            <Form form={form} layout="vertical" onFinish={(values) => void submit(values)} requiredMark="optional">
                <Form.Item
                    name="novelId"
                    label="Truyện"
                    rules={[{ required: true, type: 'number', min: 1, message: 'Chọn truyện' }]}
                >
                    <Select
                        showSearch
                        placeholder="Chọn truyện trong thư viện"
                        loading={novelsQuery.isLoading}
                        optionFilterProp="label"
                        options={novels.map((novel) => ({ value: novel.id, label: novel.title }))}
                        notFoundContent={novelsQuery.isLoading ? 'Đang tải…' : 'Thư viện chưa có truyện'}
                    />
                </Form.Item>

                <Form.Item name="daysOfWeek" label="Ngày chạy" rules={[{ required: true, message: 'Chọn ít nhất một ngày' }]}>
                    <Checkbox.Group style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }} options={DAY_OPTIONS} />
                </Form.Item>
                <Space wrap style={{ marginTop: -8, marginBottom: 16 }}>
                    <Button size="small" onClick={() => form.setFieldValue('daysOfWeek', ALL_DAYS)}>
                        Hàng ngày
                    </Button>
                    <Button size="small" onClick={() => form.setFieldValue('daysOfWeek', WEEKDAYS)}>
                        T2 – T6
                    </Button>
                    <Button size="small" onClick={() => form.setFieldValue('daysOfWeek', WEEKEND)}>
                        Cuối tuần
                    </Button>
                </Space>

                <Form.Item label="Giờ chạy" required extra="Theo giờ máy chủ. Mặc định chạy một lần vào giờ này.">
                    <Form.Item
                        name="timeOfDay"
                        noStyle
                        rules={[
                            { required: true, message: 'Chọn giờ chạy' },
                            { pattern: /^([01]\d|2[0-3]):[0-5]\d/, message: 'Giờ không hợp lệ' },
                        ]}
                    >
                        <Input type="time" step={60} style={{ width: 160 }} />
                    </Form.Item>
                </Form.Item>

                <Divider titlePlacement="start" plain style={{ marginTop: 4 }}>
                    Tự động sau khi có chương mới
                </Divider>

                <Form.Item
                    name="autoCrawl"
                    label="Tự động cào"
                    valuePropName="checked"
                    extra="Đồng bộ danh sách chương, cào các chương mới nếu có."
                    style={{ marginBottom: 12 }}
                >
                    <Switch />
                </Form.Item>
                <Form.Item
                    name="autoTts"
                    label="Tự động TTS"
                    valuePropName="checked"
                    extra="Tạo audio cho các chương còn thiếu sau khi cào xong."
                    style={{ marginBottom: 12 }}
                >
                    <Switch />
                </Form.Item>
                <Form.Item
                    name="autoDrive"
                    label="Tự động đẩy Drive"
                    valuePropName="checked"
                    extra="Đẩy các file MP3 còn thiếu lên Google Drive sau khi tạo audio."
                    style={{ marginBottom: 12 }}
                >
                    <Switch />
                </Form.Item>
                <Form.Item name="active" label="Hoạt động" valuePropName="checked" extra="Tắt để tạm ngưng lịch, không cần xóa.">
                    <Switch checkedChildren="Bật" unCheckedChildren="Tắt" />
                </Form.Item>

                {!novelsQuery.isLoading && novels.length === 0 ? (
                    <Alert type="warning" showIcon title="Thư viện chưa có truyện" description="Thêm truyện và cào trước khi tạo lịch." />
                ) : null}

                <Typography.Paragraph type="secondary" style={{ marginTop: 16, marginBottom: 0, fontSize: 12 }}>
                    Khi đến giờ, hệ thống kiểm tra danh sách chương trước. Không có chương mới thì bỏ qua, không tạo job.
                </Typography.Paragraph>
            </Form>
        </Drawer>
    );
}
