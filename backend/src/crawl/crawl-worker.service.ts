import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { spawn, type ChildProcess } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, openSync } from 'fs';
import path from 'path';
import { resolvePythonLaunch } from 'src/tts/tts-worker.service';
import { resolveWorkerDir } from 'src/tts/tts-settings.service';

@Injectable()
export class CrawlWorkerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(CrawlWorkerService.name);
    private child: ChildProcess | null = null;
    private stopping = false;
    private failures = 0;

    onModuleInit(): void {
        if (process.env.JEST_WORKER_ID || process.env.CRAWL_WORKER_AUTOSTART === '0') {
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
        const script = path.join(workerDir, 'crawl_worker.py');
        if (!existsSync(script)) {
            this.logger.error(`Không thấy ${script}`);
            return;
        }

        const python = resolvePythonLaunch();
        const args = [...python.prefix, '-u', script];
        const logDir = path.join(workerDir, 'logs');
        mkdirSync(logDir, { recursive: true });
        const logPath = path.join(logDir, 'crawl_worker.log');
        appendFileSync(logPath, `\n--- spawn ${python.command} ${args.join(' ')} ---\n`);
        const logFd = openSync(logPath, 'a');
        const startedAt = Date.now();

        this.child = spawn(python.command, args, {
            cwd: workerDir,
            stdio: ['ignore', logFd, logFd],
            windowsHide: true,
        });
        this.logger.log(`Crawl worker pid=${this.child.pid ?? '?'} (${python.command})`);
        this.child.on('error', (error: NodeJS.ErrnoException) => {
            appendFileSync(logPath, `spawn error: ${error.message}\n`);
            this.logger.error(`Không chạy được crawl worker: ${error.message}`);
        });
        this.child.on('exit', (code, exitSignal) => {
            appendFileSync(logPath, `exit code=${code} signal=${exitSignal ?? ''}\n`);
            if (this.stopping || code === 0) {
                return;
            }
            if (Date.now() - startedAt > 5000) {
                this.failures = 0;
            }
            this.failures += 1;
            if (this.failures > 5) {
                this.logger.error('Crawl worker không khởi động được. Xem worker/logs/crawl_worker.log');
                return;
            }
            this.logger.warn(`Crawl worker thoát code=${code} signal=${exitSignal ?? ''}`);
            setTimeout(() => {
                if (!this.stopping) {
                    this.launch();
                }
            }, 2000);
        });
    }
}
