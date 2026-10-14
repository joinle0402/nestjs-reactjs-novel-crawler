import { DeleteOutlined, PauseCircleOutlined, PlayCircleOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Card, Form, Input, Popconfirm, Space, Typography, Upload, message } from 'antd';
import { useRef, useState } from 'react';
import { getBgmAudioUrl, type BgmTrack } from '@/features/bgm/api/bgmApi.ts';
import { useBgmTracksQuery, useCreateBgmTrackMutation, useDeleteBgmTrackMutation } from '@/features/bgm/hooks/useBgmQueries.ts';
import { getErrorMessage } from '@/shared/api/errorMessage.ts';

type AddForm = {
    name: string;
};

export function BgmPage() {
    const [form] = Form.useForm<AddForm>();
    const [file, setFile] = useState<File | null>(null);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const tracksQuery = useBgmTracksQuery();
    const createMutation = useCreateBgmTrackMutation();
    const deleteMutation = useDeleteBgmTrackMutation();

    const stopPreview = () => {
        const audio = audioRef.current;
        if (audio) {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
        }
        setPlayingId(null);
    };

    const togglePreview = (track: BgmTrack) => {
        const audio = audioRef.current;
        if (!audio) {
            return;
        }
        if (playingId === track.id) {
            stopPreview();
            return;
        }
        audio.src = getBgmAudioUrl(track.id);
        audio.loop = true;
        void audio.play().then(() => setPlayingId(track.id)).catch(() => {
            setPlayingId(null);
            message.error('Không phát được file nhạc nền');
        });
    };

    const onFinish = async (values: AddForm) => {
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
            form.resetFields();
            setFile(null);
        } catch (error) {
            message.error(getErrorMessage(error, 'Không thêm được nhạc nền'));
        }
    };

    const tracks = tracksQuery.data ?? [];

    return (
        <Space orientation="vertical" size={16} style={{ width: '100%', maxWidth: 720 }}>
            <Card title="Nhạc nền">
                <Typography.Paragraph type="secondary">
                    Thêm track để nghe cùng giọng đọc, hoặc trộn vào MP3 lúc upload Drive. File chương trên máy vẫn chỉ là giọng.
                </Typography.Paragraph>
                <Form form={form} layout="vertical" onFinish={(values) => void onFinish(values)}>
                    <Form.Item name="name" label="Tên" rules={[{ required: true, whitespace: true, message: 'Nhập tên nhạc nền' }, { max: 80, message: 'Tối đa 80 ký tự' }]}>
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
                            fileList={
                                file
                                    ? [{ uid: 'bgm-file', name: file.name, status: 'done' }]
                                    : []
                            }
                        >
                            <Button icon={<UploadOutlined />}>Chọn file</Button>
                        </Upload>
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
                        Thêm nhạc nền
                    </Button>
                </Form>
                <audio ref={audioRef} preload="none" />
            </Card>

            <Card title={`Thư viện (${tracks.length})`}>
                {tracksQuery.isError ? (
                    <Typography.Text type="danger">{getErrorMessage(tracksQuery.error, 'Không tải được danh sách')}</Typography.Text>
                ) : tracks.length === 0 ? (
                    <Typography.Text type="secondary">{tracksQuery.isLoading ? 'Đang tải...' : 'Chưa có nhạc nền.'}</Typography.Text>
                ) : (
                    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                        {tracks.map((track) => (
                            <div key={track.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Button
                                    type="text"
                                    icon={playingId === track.id ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                                    aria-label={playingId === track.id ? 'Dừng nghe thử' : 'Nghe thử'}
                                    onClick={() => togglePreview(track)}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <Typography.Text strong ellipsis>
                                        {track.name}
                                    </Typography.Text>
                                </div>
                                <Popconfirm
                                    title="Xóa nhạc nền này?"
                                    okText="Xóa"
                                    cancelText="Hủy"
                                    onConfirm={() => {
                                        if (playingId === track.id) {
                                            stopPreview();
                                        }
                                        deleteMutation.mutate(track.id, {
                                            onSuccess: () => message.success('Đã xóa nhạc nền'),
                                            onError: (error) => message.error(getErrorMessage(error, 'Không xóa được')),
                                        });
                                    }}
                                >
                                    <Button type="text" danger icon={<DeleteOutlined />} aria-label={`Xóa ${track.name}`} />
                                </Popconfirm>
                            </div>
                        ))}
                    </Space>
                )}
            </Card>
        </Space>
    );
}
