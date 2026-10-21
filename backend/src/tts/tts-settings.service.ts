import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { TTS_ENGINE, TTS_ENGINES, voicesForEngine, type TtsEngine } from './entities/tts-job.entity';
import { TtsSettingsResponse } from './dtos/responses/tts-settings.response';
import { UpdateTtsSettingsRequest } from './dtos/requests/update-tts-settings.request';
import { throwUnless } from 'src/common/utils/throw-if';

export type TtsSettings = {
    engine: string;
    voice: string;
    rate: string;
    bgmEnabled: boolean;
    engineIdleMinutes: number;
};

const DEFAULTS: TtsSettings = {
    engine: TTS_ENGINE,
    voice: 'vi-VN-HoaiMyNeural',
    rate: '+50%',
    bgmEnabled: true,
    engineIdleMinutes: 0,
};

const ENGINE_LABELS: Record<TtsEngine, string> = {
    'edge-tts': 'edge-tts',
    vieneu: 'VieNeu (offline)',
    zerotts: 'ZeroTTS (offline)',
};

export function resolveWorkerDir(): string {
    const candidates = [path.resolve(process.cwd(), 'worker'), path.resolve(process.cwd(), '..', 'worker')];
    return candidates.find((dir) => existsSync(path.join(dir, 'config.py'))) ?? candidates[1];
}

export function ttsSettingsPath(): string {
    return path.join(resolveWorkerDir(), 'tts_settings.json');
}

@Injectable()
export class TtsSettingsService {
    async get(): Promise<TtsSettingsResponse> {
        const settings = await this.read();
        return {
            ...settings,
            voices: this.voiceOptions(settings.engine, settings.voice),
            engines: this.engineOptions(),
        };
    }

    async read(): Promise<TtsSettings> {
        const filePath = ttsSettingsPath();
        try {
            const raw = await readFile(filePath, 'utf8');
            return this.normalize(JSON.parse(raw) as unknown);
        } catch {
            return { ...DEFAULTS };
        }
    }

    async update(request: UpdateTtsSettingsRequest): Promise<TtsSettingsResponse> {
        const current = await this.read();
        throwUnless(TTS_ENGINES.includes(request.engine as TtsEngine), 'Engine TTS không được hỗ trợ');
        throwUnless(this.allowedVoices(request.engine, current.voice).has(request.voice), 'Giọng không thuộc engine đã chọn');
        const next: TtsSettings = {
            engine: request.engine,
            voice: request.voice,
            rate: request.rate,
            bgmEnabled: request.bgmEnabled,
            engineIdleMinutes: request.engineIdleMinutes,
        };
        await this.write(next);
        return {
            ...next,
            voices: this.voiceOptions(next.engine, next.voice),
            engines: this.engineOptions(),
        };
    }

    allowedVoices(engine: string, currentVoice?: string): Set<string> {
        const allowed = new Set(voicesForEngine(engine).map((voice) => voice.id));
        if (engine === 'edge-tts' && currentVoice) {
            allowed.add(currentVoice);
        }
        return allowed;
    }

    private engineOptions(): { id: TtsEngine; label: string; rateApplies: boolean; voices: { id: string; label: string }[] }[] {
        return TTS_ENGINES.map((engine) => ({
            id: engine,
            label: ENGINE_LABELS[engine] ?? engine,
            rateApplies: engine === 'edge-tts',
            voices: voicesForEngine(engine).map((voice) => ({ ...voice })),
        }));
    }

    private voiceOptions(engine: string, currentVoice: string): { id: string; label: string }[] {
        const voices = voicesForEngine(engine).map((voice) => ({ ...voice }));
        if (!voices.some((voice) => voice.id === currentVoice)) {
            voices.push({ id: currentVoice, label: currentVoice });
        }
        return voices;
    }

    private normalize(value: unknown): TtsSettings {
        const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
        const engine = typeof record.engine === 'string' && record.engine.trim() ? record.engine.trim() : DEFAULTS.engine;
        const voice = typeof record.voice === 'string' && record.voice.trim() ? record.voice.trim() : DEFAULTS.voice;
        const rate = typeof record.rate === 'string' && record.rate.trim() ? record.rate.trim() : DEFAULTS.rate;
        const bgmEnabled = typeof record.bgmEnabled === 'boolean' ? record.bgmEnabled : DEFAULTS.bgmEnabled;
        const idleRaw = typeof record.engineIdleMinutes === 'number' ? record.engineIdleMinutes : DEFAULTS.engineIdleMinutes;
        const engineIdleMinutes = Number.isFinite(idleRaw) ? Math.min(1440, Math.max(0, Math.trunc(idleRaw))) : DEFAULTS.engineIdleMinutes;
        return { engine, voice, rate, bgmEnabled, engineIdleMinutes };
    }

    private async write(settings: TtsSettings): Promise<void> {
        const filePath = ttsSettingsPath();
        const tmpPath = `${filePath}.tmp`;
        await writeFile(tmpPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
        await rename(tmpPath, filePath);
    }
}
