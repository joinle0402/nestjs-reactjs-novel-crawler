import { HttpException, HttpStatus } from '@nestjs/common';
import { spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { resolvePythonLaunch } from 'src/tts/tts-worker.service';
import { resolveWorkerDir } from 'src/tts/tts-settings.service';
import type { CrawlPreviewResponse } from './dtos/responses/crawl.response';

const PREVIEW_TIMEOUT_MS = 75_000;
const ERROR_MARK = 'PREVIEW_ERROR:';

type PreviewPayload = {
    novelId?: unknown;
    title?: unknown;
    author?: unknown;
    summary?: unknown;
    chapterCount?: unknown;
    vipCount?: unknown;
};

export function readNovelPreview(url: string): Promise<CrawlPreviewResponse> {
    const workerDir = resolveWorkerDir();
    const script = path.join(workerDir, 'preview_novel.py');
    if (!existsSync(script)) {
        throw new HttpException('Không thấy worker/preview_novel.py', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const python = resolvePythonLaunch();
    return new Promise((resolve, reject) => {
        const child = spawn(python.command, [...python.prefix, '-X', 'utf8', '-u', script, url], {
            cwd: workerDir,
            windowsHide: true,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
        });
        let stdout = '';
        let stderr = '';
        let settled = false;
        let timer: ReturnType<typeof setTimeout>;

        const finish = (error: HttpException | null, value?: CrawlPreviewResponse) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            if (error) {
                reject(error);
                return;
            }
            resolve(value!);
        };

        timer = setTimeout(() => {
            killProcessTree(child.pid);
            finish(new HttpException('Đọc trang nguồn quá lâu. Thử lại.', HttpStatus.GATEWAY_TIMEOUT));
        }, PREVIEW_TIMEOUT_MS);

        child.stdout?.setEncoding('utf8');
        child.stderr?.setEncoding('utf8');
        child.stdout?.on('data', (chunk: string) => {
            stdout += chunk;
        });
        child.stderr?.on('data', (chunk: string) => {
            stderr += chunk;
        });
        child.on('error', (error: NodeJS.ErrnoException) => {
            finish(new HttpException(`Không chạy được trình đọc trang: ${error.message}`, HttpStatus.INTERNAL_SERVER_ERROR));
        });
        child.on('exit', (code) => {
            if (code !== 0) {
                finish(new HttpException(previewErrorMessage(stderr), HttpStatus.BAD_GATEWAY));
                return;
            }
            const parsed = parsePreview(stdout, url);
            if (!parsed) {
                finish(new HttpException('Trang nguồn không trả dữ liệu đọc được.', HttpStatus.BAD_GATEWAY));
                return;
            }
            finish(null, parsed);
        });
    });
}

function parsePreview(stdout: string, url: string): CrawlPreviewResponse | null {
    const line = stdout
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter((item) => item.startsWith('{'))
        .at(-1);
    if (!line) {
        return null;
    }
    let payload: PreviewPayload;
    try {
        payload = JSON.parse(line) as PreviewPayload;
    } catch {
        return null;
    }
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const novelId = Number(payload.novelId);
    const chapterCount = Number(payload.chapterCount);
    const vipCount = Number(payload.vipCount);
    if (!title || !Number.isInteger(novelId) || novelId <= 0 || !Number.isInteger(chapterCount) || chapterCount < 0 || !Number.isInteger(vipCount) || vipCount < 0) {
        return null;
    }
    return {
        url,
        novelId,
        title,
        author: typeof payload.author === 'string' ? payload.author.trim() : '',
        summary: typeof payload.summary === 'string' ? payload.summary.trim() : '',
        chapterCount,
        vipCount,
    };
}

function previewErrorMessage(stderr: string): string {
    const marked = stderr
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.startsWith(ERROR_MARK))
        .at(-1);
    const text = marked?.slice(ERROR_MARK.length).trim() ?? '';
    return text.slice(0, 400) || 'Không đọc được trang nguồn.';
}

function killProcessTree(pid: number | undefined): void {
    if (!pid) {
        return;
    }
    if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
        return;
    }
    try {
        process.kill(pid, 'SIGKILL');
    } catch {
        return;
    }
}
