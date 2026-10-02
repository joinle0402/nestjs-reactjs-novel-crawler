import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { appendFileSync, existsSync, mkdirSync, openSync, writeFileSync } from 'fs';
import path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { resolveWorkerDir } from 'src/tts/tts-settings.service';
import { resolvePythonLaunch } from 'src/tts/tts-worker.service';

function workerLogLine(message: string): string {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const timestamp = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    return `[${timestamp}] ${message}\n`;
}

/**
 * Spawn worker/drive_worker.py giống TtsWorkerService: worker tự poll
 * bảng drive_upload_jobs và spawn drive_upload_runner cho từng job.
 */
@Injectable()
export class DriveWorkerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(DriveWorkerService.name);
    private child: ChildProcess | null = null;
    private stopping = false;
    private failures = 0;

    onModuleInit(): void {
        if (process.env.JEST_WORKER_ID || process.env.DRIVE_WORKER_AUTOSTART === '0') {
            return;
        }
        this.launch();
    }

    onModuleDestroy(): void {
        this.stopping = true;
        if (this.child && !this.child.killed) {
            this.child.kill();
        }
    }

    private launch(): void {
        const workerDir = resolveWorkerDir();
        const script = path.join(workerDir, 'drive_worker.py');
        if (!existsSync(script)) {
            this.logger.error(`Không thấy ${script}`);
            return;
        }

        const python = resolvePythonLaunch();
        const args = [...python.prefix, '-u', script];
        const logDir = path.join(workerDir, 'logs');
        mkdirSync(logDir, { recursive: true });
        const logPath = path.join(logDir, 'drive_worker.log');
        writeFileSync(logPath, workerLogLine(`--- spawn ${python.command} ${args.join(' ')} ---`), 'utf8');
        const logFd = openSync(logPath, 'a');
        const startedAt = Date.now();

        this.child = spawn(python.command, args, {
            cwd: workerDir,
            stdio: ['ignore', logFd, logFd],
            windowsHide: true,
        });
        this.logger.log(`Drive worker pid=${this.child.pid ?? '?'} (${python.command})`);
        this.child.on('error', (error: NodeJS.ErrnoException) => {
            appendFileSync(logPath, workerLogLine(`spawn error: ${error.message}`));
            this.logger.error(`Không chạy được Drive worker: ${error.message}`);
        });
        this.child.on('exit', (code, exitSignal) => {
            appendFileSync(logPath, workerLogLine(`exit code=${code} signal=${exitSignal ?? ''}`));
            if (this.stopping || code === 0) {
                return;
            }
            if (Date.now() - startedAt > 5000) {
                this.failures = 0;
            }
            this.failures += 1;
            if (this.failures > 5) {
                this.logger.error('Drive worker không khởi động được. Xem worker/logs/drive_worker.log');
                return;
            }
            this.logger.warn(`Drive worker thoát code=${code} signal=${exitSignal ?? ''}`);
            setTimeout(() => {
                if (!this.stopping) {
                    this.launch();
                }
            }, 2000);
        });
    }
}