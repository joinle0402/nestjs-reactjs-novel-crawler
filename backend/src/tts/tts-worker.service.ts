import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { execFileSync, spawn, type ChildProcess } from 'child_process';
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync } from 'fs';
import path from 'path';
import { resolveWorkerDir } from './tts-settings.service';

type PythonLaunch = { command: string; prefix: string[] };

function pythonCanImportDb(command: string, prefix: string[]): boolean {
    try {
        execFileSync(command, [...prefix, '-c', 'import pymysql'], {
            stdio: 'ignore',
            windowsHide: true,
        });
        return true;
    } catch {
        return false;
    }
}

/** Console đang dùng pyenv (có pymysql). `python` trên PATH của Nest đôi khi là bản khác. */
export function resolvePythonLaunch(): PythonLaunch {
    const candidates: PythonLaunch[] = [];
    if (process.env.PYTHON) {
        candidates.push({ command: process.env.PYTHON, prefix: [] });
    }
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const versionFile = path.join(home, '.pyenv', 'pyenv-win', 'version');
    if (home && existsSync(versionFile)) {
        const version = readFileSync(versionFile, 'utf8').trim().split(/\s+/)[0];
        const exe = path.join(home, '.pyenv', 'pyenv-win', 'versions', version, 'python.exe');
        if (existsSync(exe)) {
            candidates.push({ command: exe, prefix: [] });
        }
    }
    const venv = path.join(resolveWorkerDir(), '.venv', 'Scripts', 'python.exe');
    if (existsSync(venv)) {
        candidates.push({ command: venv, prefix: [] });
    }
    candidates.push({ command: 'python', prefix: [] }, { command: 'py', prefix: ['-3'] });
    return (
        candidates.find((candidate) => pythonCanImportDb(candidate.command, candidate.prefix)) ?? {
            command: 'python',
            prefix: [],
        }
    );
}

@Injectable()
export class TtsWorkerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TtsWorkerService.name);
    private child: ChildProcess | null = null;
    private stopping = false;
    private failures = 0;

    onModuleInit(): void {
        if (process.env.JEST_WORKER_ID || process.env.TTS_WORKER_AUTOSTART === '0') {
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
        const script = path.join(workerDir, 'tts_worker.py');
        if (!existsSync(script)) {
            this.logger.error(`Không thấy ${script}`);
            return;
        }

        const python = resolvePythonLaunch();
        const args = [...python.prefix, '-u', script];
        const logDir = path.join(workerDir, 'logs');
        mkdirSync(logDir, { recursive: true });
        const logPath = path.join(logDir, 'tts_worker.log');
        appendFileSync(logPath, `\n--- spawn ${python.command} ${args.join(' ')} ---\n`);
        const logFd = openSync(logPath, 'a');
        const startedAt = Date.now();

        this.child = spawn(python.command, args, {
            cwd: workerDir,
            stdio: ['ignore', logFd, logFd],
            windowsHide: true,
        });
        this.logger.log(`TTS worker pid=${this.child.pid ?? '?'} (${python.command})`);
        this.child.on('error', (error: NodeJS.ErrnoException) => {
            appendFileSync(logPath, `spawn error: ${error.message}\n`);
            this.logger.error(`Không chạy được TTS worker: ${error.message}`);
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
                this.logger.error('TTS worker không khởi động được. Xem worker/logs/tts_worker.log');
                return;
            }
            this.logger.warn(`TTS worker thoát code=${code} signal=${exitSignal ?? ''}`);
            setTimeout(() => {
                if (!this.stopping) {
                    this.launch();
                }
            }, 2000);
        });
    }
}
