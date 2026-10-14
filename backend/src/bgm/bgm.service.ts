import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { throwUnless } from 'src/common/utils/throw-if';
import { resolveWorkerDir } from 'src/tts/tts-settings.service';
import type { BgmCatalog, BgmTrack } from './bgm.types';

const LEGACY_SOURCE = 'Just_Stay_Aakash_Gandhi.mp3';
const LEGACY_ID = 'just-stay-aakash-gandhi';

const AUDIO_EXTENSIONS = new Map<string, string>([
    ['.mp3', 'audio/mpeg'],
    ['.wav', 'audio/wav'],
    ['.ogg', 'audio/ogg'],
    ['.m4a', 'audio/mp4'],
    ['.flac', 'audio/flac'],
    ['.aac', 'audio/aac'],
    ['.webm', 'audio/webm'],
]);

export type UploadedAudio = {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
};

@Injectable()
export class BgmService {
    private legacyImport: Promise<void> = Promise.resolve();

    async list(): Promise<BgmTrack[]> {
        await this.ensureLegacyTrack();
        const catalog = await this.readCatalog();
        return [...catalog.tracks].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    async create(name: string, file: UploadedAudio | undefined): Promise<BgmTrack> {
        await this.ensureLegacyTrack();
        const title = name.trim().replace(/\s+/g, ' ');
        throwUnless(title.length > 0 && title.length <= 80, 'Nhập tên nhạc nền (tối đa 80 ký tự)');
        throwUnless(file && file.size > 0 && file.buffer?.length, 'Chọn file audio');
        const extension = path.extname(file.originalname || '').toLowerCase();
        throwUnless(AUDIO_EXTENSIONS.has(extension), 'Chỉ nhận file mp3, wav, ogg, m4a, flac, aac hoặc webm');

        const id = randomUUID();
        const fileName = `${id}${extension}`;
        await mkdir(this.filesDir(), { recursive: true });
        await writeFile(path.join(this.filesDir(), fileName), file.buffer);

        const track: BgmTrack = {
            id,
            name: title,
            fileName,
            createdAt: new Date().toISOString(),
        };
        const catalog = await this.readCatalog();
        catalog.tracks.push(track);
        await this.writeCatalog(catalog);
        return track;
    }

    async remove(id: string): Promise<void> {
        await this.removeMany([id]);
    }

    async removeMany(ids: string[]): Promise<void> {
        await this.ensureLegacyTrack();
        const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
        throwUnless(unique.length > 0, 'Chọn nhạc nền để xóa');
        const catalog = await this.readCatalog();
        const removing = catalog.tracks.filter((track) => unique.includes(track.id));
        throwUnless(removing.length > 0, 'Không tìm thấy nhạc nền', HttpStatus.NOT_FOUND);
        catalog.tracks = catalog.tracks.filter((track) => !unique.includes(track.id));
        await this.writeCatalog(catalog);
        await Promise.all(
            removing.map(async (track) => {
                const filePath = this.safeFile(track.fileName);
                if (filePath && existsSync(filePath)) {
                    await unlink(filePath);
                }
            }),
        );
    }

    resolve(id: string): { filePath: string; contentType: string } {
        const catalogPath = this.catalogFile();
        throwUnless(existsSync(catalogPath), 'Không tìm thấy nhạc nền', HttpStatus.NOT_FOUND);
        let catalog: BgmCatalog;
        try {
            catalog = this.normalize(JSON.parse(readFileSync(catalogPath, 'utf8')) as unknown);
        } catch {
            throwUnless(false, 'Không tìm thấy nhạc nền', HttpStatus.NOT_FOUND);
        }
        const track = catalog.tracks.find((item) => item.id === id);
        throwUnless(track, 'Không tìm thấy nhạc nền', HttpStatus.NOT_FOUND);
        const filePath = this.safeFile(track.fileName);
        throwUnless(filePath && existsSync(filePath), 'File nhạc nền không còn trên máy', HttpStatus.NOT_FOUND);
        const contentType = AUDIO_EXTENSIONS.get(path.extname(track.fileName).toLowerCase()) ?? 'application/octet-stream';
        return { filePath, contentType };
    }

    async exists(id: string): Promise<boolean> {
        const catalog = await this.readCatalog();
        const track = catalog.tracks.find((item) => item.id === id);
        if (!track) {
            return false;
        }
        const filePath = this.safeFile(track.fileName);
        return Boolean(filePath && existsSync(filePath));
    }

    private catalogFile(): string {
        return path.join(resolveWorkerDir(), 'bgm', 'catalog.json');
    }

    private filesDir(): string {
        return path.join(resolveWorkerDir(), 'bgm', 'files');
    }

    private safeFile(fileName: string): string | null {
        if (!fileName || fileName !== path.basename(fileName) || fileName.includes('..')) {
            return null;
        }
        const root = path.resolve(this.filesDir());
        const absolute = path.resolve(root, fileName);
        const prefix = root.endsWith(path.sep) ? root : root + path.sep;
        if (absolute !== root && !absolute.toLowerCase().startsWith(prefix.toLowerCase())) {
            return null;
        }
        return absolute;
    }

    private ensureLegacyTrack(): Promise<void> {
        this.legacyImport = this.legacyImport.catch(() => undefined).then(() => this.importLegacyTrack());
        return this.legacyImport;
    }

    private async importLegacyTrack(): Promise<void> {
        const catalog = await this.readCatalog();
        if ((catalog.importedSources ?? []).includes(LEGACY_SOURCE)) {
            return;
        }
        const sourcePath = path.join(resolveWorkerDir(), LEGACY_SOURCE);
        if (!existsSync(sourcePath)) {
            return;
        }
        if (!catalog.tracks.some((track) => track.id === LEGACY_ID)) {
            const fileName = `${LEGACY_ID}.mp3`;
            await mkdir(this.filesDir(), { recursive: true });
            await copyFile(sourcePath, path.join(this.filesDir(), fileName));
            const sourceStat = await stat(sourcePath);
            catalog.tracks.push({
                id: LEGACY_ID,
                name: 'Just Stay',
                fileName,
                createdAt: sourceStat.mtime.toISOString(),
            });
        }
        catalog.importedSources = [...(catalog.importedSources ?? []), LEGACY_SOURCE];
        await this.writeCatalog(catalog);
    }

    private async readCatalog(): Promise<BgmCatalog> {
        const filePath = this.catalogFile();
        try {
            const raw = await readFile(filePath, 'utf8');
            return this.normalize(JSON.parse(raw) as unknown);
        } catch {
            return { tracks: [] };
        }
    }

    private normalize(value: unknown): BgmCatalog {
        const record = value && typeof value === 'object' ? (value as { tracks?: unknown; importedSources?: unknown }) : {};
        const tracks = Array.isArray(record.tracks) ? record.tracks : [];
        const importedSources = Array.isArray(record.importedSources)
            ? record.importedSources.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            : [];
        const parsed: BgmTrack[] = [];
        for (const item of tracks) {
            if (!item || typeof item !== 'object') {
                continue;
            }
            const row = item as Record<string, unknown>;
            const id = typeof row.id === 'string' ? row.id.trim() : '';
            const name = typeof row.name === 'string' ? row.name.trim() : '';
            const fileName = typeof row.fileName === 'string' ? row.fileName.trim() : '';
            const createdAt = typeof row.createdAt === 'string' ? row.createdAt : '';
            if (!id || !name || !fileName) {
                continue;
            }
            parsed.push({ id, name, fileName, createdAt });
        }
        return { tracks: parsed, importedSources };
    }

    private async writeCatalog(catalog: BgmCatalog): Promise<void> {
        const filePath = this.catalogFile();
        await mkdir(path.dirname(filePath), { recursive: true });
        const tmpPath = `${filePath}.tmp`;
        await writeFile(tmpPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
        await rename(tmpPath, filePath);
    }
}
