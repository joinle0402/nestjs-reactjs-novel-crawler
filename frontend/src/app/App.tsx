import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Result } from 'antd';
import { MainLayout } from '@/layouts/MainLayout.tsx';
import { DashboardPage } from '@/features/novels/pages/DashboardPage.tsx';
import { NovelDetailPage } from '@/features/novels/pages/NovelDetailPage.tsx';
import { ChapterReaderPage } from '@/features/chapters/pages/ChapterReaderPage.tsx';
import { AudioPlayerProvider } from '@/features/audio/AudioPlayerContext.tsx';
import { TtsSettingsPage } from '@/features/tts/pages/TtsSettingsPage.tsx';
import { CrawlPage } from '@/features/crawl/pages/CrawlPage.tsx';

function App() {
    return (
        <BrowserRouter>
            <AudioPlayerProvider>
                <Routes>
                    <Route element={<MainLayout />}>
                        <Route path="/" element={<DashboardPage />} />
                        <Route path="/novels/:novelId" element={<NovelDetailPage />} />
                        <Route path="/novels/:novelId/chapters/:chapterId" element={<ChapterReaderPage />} />
                        <Route path="/settings" element={<TtsSettingsPage />} />
                        <Route path="/crawl" element={<CrawlPage />} />
                        <Route path="/dashboard" element={<Navigate to="/" replace />} />
                        <Route path="*" element={<Result status="404" title="Không tìm thấy trang" />} />
                    </Route>
                </Routes>
            </AudioPlayerProvider>
        </BrowserRouter>
    );
}

export default App;
