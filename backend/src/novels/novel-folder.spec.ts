jest.mock('child_process', () => ({
    ...jest.requireActual<Record<string, unknown>>('child_process'),
    spawn: jest.fn(),
}));

import { spawn } from 'child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { openFolderInExplorer, resolveNovelMp3Folder, safeFolderName } from './novel-folder';

describe('safeFolderName', () => {
    it('bỏ ký tự cấm và gộp khoảng trắng giống _safe_filename của worker', () => {
        expect(safeFolderName('  Màn trời: "Video" / ngắn?  ')).toBe('Màn trời Video ngắn');
    });

    it('cắt tối đa 80 ký tự và có fallback', () => {
        expect(safeFolderName('a'.repeat(120))).toHaveLength(80);
        expect(safeFolderName('   ')).toBe('chapter');
    });
});

describe('resolveNovelMp3Folder', () => {
    let root: string;

    beforeEach(() => {
        root = mkdtempSync(path.join(os.tmpdir(), 'novel-folder-'));
    });

    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });

    it('ưu tiên thư mục lấy từ mp3_path đã lưu', () => {
        const folder = path.join(root, 'Tên cũ');
        mkdirSync(folder, { recursive: true });
        const result = resolveNovelMp3Folder('Tên mới', [path.join(folder, '0001_a.mp3')], root);
        expect(result).toEqual({ path: folder, found: true });
    });

    it('đoán theo tên truyện khi chưa có mp3_path', () => {
        const folder = path.join(root, safeFolderName('Truyện A'));
        mkdirSync(folder, { recursive: true });
        expect(resolveNovelMp3Folder('Truyện A', [null, ''], root)).toEqual({ path: folder, found: true });
    });

    it('bỏ qua đường dẫn nằm ngoài thư mục gốc', () => {
        const outside = mkdtempSync(path.join(os.tmpdir(), 'novel-folder-outside-'));
        try {
            expect(resolveNovelMp3Folder('Truyện B', [path.join(outside, '0001_a.mp3')], root)).toEqual({
                path: root,
                found: false,
            });
        } finally {
            rmSync(outside, { recursive: true, force: true });
        }
    });

    it('trả về thư mục gốc khi chưa có thư mục của truyện', () => {
        expect(resolveNovelMp3Folder('Truyện C', [], root)).toEqual({ path: root, found: false });
    });
});

describe('openFolderInExplorer', () => {
    it('không truyền windowsHide — cờ này làm explorer tạo cửa sổ ẩn, người dùng không thấy gì', () => {
        const folder = mkdtempSync(path.join(os.tmpdir(), 'novel-open-'));
        const spawnMock = spawn as unknown as jest.Mock;
        spawnMock.mockReturnValue({ on: jest.fn(), unref: jest.fn() });

        try {
            openFolderInExplorer(folder);

            expect(spawnMock).toHaveBeenCalledTimes(1);
            const [command, args, options] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];
            expect(args).toEqual([folder]);
            expect(command).not.toBe('');
            expect(options.detached).toBe(true);
            expect(options.windowsHide).toBeUndefined();
        } finally {
            spawnMock.mockReset();
            rmSync(folder, { recursive: true, force: true });
        }
    });
});
