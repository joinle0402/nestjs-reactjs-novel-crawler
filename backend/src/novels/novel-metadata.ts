import { BadGatewayException } from '@nestjs/common';
import { detectSourceKind } from '../crawl/novel-url';

export type NovelMetadata = {
    url: string;
    title: string;
    author: string;
    summary: string;
    cover: string;
};

const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const COVER_PLACEHOLDERS = ['bookcover256.jpg', 'default-cover.jpg'];

/**
 * Đọc metadata truyện bằng HTTP thường (không mở trình duyệt).
 * Dùng cho `GET /crawl/preview` để thêm truyện nhanh và lấy luôn ảnh bìa.
 */
export async function fetchNovelMetadata(novelUrl: string): Promise<NovelMetadata> {
    const html = await fetchHtml(novelUrl);
    return parseNovelMetadata(html, novelUrl);
}

export function parseNovelMetadata(html: string, novelUrl: string): NovelMetadata {
    const meta = readMetaTags(html);
    const isWikicv = detectSourceKind(novelUrl) === 'wikicv';

    const title = cleanLine(
        (isWikicv ? wikicvTitle(html) : sangtacvietTitle(html)) || meta.get('og:title') || meta.get('og:novel:book_name') || '',
    );
    if (!title) {
        throw new BadGatewayException('Không đọc được tên truyện từ trang nguồn.');
    }

    const author = cleanLine((isWikicv ? wikicvAuthor(html) : '') || meta.get('og:novel:author') || '');
    const summary = isWikicv
        ? wikicvSummary(html)
        : sangtacvietSummary(html) || cleanLine(meta.get('og:description') || '');
    const cover = resolveCover((isWikicv ? wikicvCover(html) : '') || meta.get('og:image') || meta.get('thumbnail') || '', novelUrl);

    return { url: novelUrl, title, author, summary, cover };
}

async function fetchHtml(url: string): Promise<string> {
    let response: Response;
    try {
        response = await fetch(url, {
            headers: {
                'user-agent': USER_AGENT,
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'accept-language': 'vi,en;q=0.9',
            },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new BadGatewayException(`Không kết nối được trang nguồn: ${message}`);
    }
    if (!response.ok) {
        throw new BadGatewayException(`Trang nguồn trả HTTP ${response.status}. Thử lại sau.`);
    }
    return response.text();
}

type MetaTags = Map<string, string>;

function readMetaTags(html: string): MetaTags {
    const tags: MetaTags = new Map();
    for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
        const attributes = new Map<string, string>();
        for (const match of tag.matchAll(/([a-zA-Z][\w:-]*)\s*=\s*"([^"]*)"/g)) {
            attributes.set(match[1].toLowerCase(), match[2]);
        }
        const key = (attributes.get('property') ?? attributes.get('name') ?? '').toLowerCase();
        const content = attributes.get('content');
        if (key && content !== undefined && !tags.has(key)) {
            tags.set(key, content);
        }
    }
    return tags;
}

function sangtacvietTitle(html: string): string {
    return extractHtml(html, /<h1\b[^>]*id="book_name2"[^>]*>([\s\S]*?)<\/h1>/i);
}

function sangtacvietSummary(html: string): string {
    return htmlToText(extractHtml(html, /<div\b[^>]*id="book-sumary"[^>]*>([\s\S]*?)<\/div>/i));
}

function wikicvTitle(html: string): string {
    return htmlToText(extractHtml(html, /<div\b[^>]*class="[^"]*\bcover-info\b[^"]*"[^>]*>[\s\S]*?<h2\b[^>]*>([\s\S]*?)<\/h2>/i));
}

function wikicvAuthor(html: string): string {
    const coverInfo = extractHtml(html, /<div\b[^>]*class="[^"]*\bcover-info\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i) || html;
    return htmlToText(extractHtml(coverInfo, /<a\b[^>]*href="\/tac-gia\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i));
}

function wikicvSummary(html: string): string {
    return htmlToText(extractHtml(html, /<div\b[^>]*class="[^"]*\bbook-desc-detail\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i));
}

function wikicvCover(html: string): string {
    return extractHtml(html, /<div\b[^>]*class="[^"]*\bcover-wrapper\b[^"]*"[^>]*>[\s\S]*?<img\b[^>]*src="([^"]+)"/i);
}

function extractHtml(html: string, pattern: RegExp): string {
    return pattern.exec(html)?.[1] ?? '';
}

function htmlToText(raw: string): string {
    if (!raw) {
        return '';
    }
    const text = decodeHtml(raw.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(?:p|div|li)>/gi, '\n').replace(/<[^>]+>/g, ' '));
    return text
        .split(/\r?\n/)
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter((line) => line.length > 0)
        .join('\n')
        .trim();
}

function cleanLine(value: string): string {
    return htmlToText(value).replace(/\s+/g, ' ').trim();
}

function resolveCover(raw: string, pageUrl: string): string {
    const src = decodeHtml(raw).trim();
    if (!src) {
        return '';
    }
    let absolute: string;
    try {
        absolute = new URL(src, pageUrl).toString();
    } catch {
        return '';
    }
    if (!/^https?:\/\//i.test(absolute)) {
        return '';
    }
    const lower = absolute.toLowerCase();
    if (COVER_PLACEHOLDERS.some((marker) => lower.includes(marker))) {
        return '';
    }
    return absolute;
}

const NAMED_ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
};

function decodeHtml(value: string): string {
    return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (entity, code: string) => {
        if (code.startsWith('#')) {
            const isHex = code[1]?.toLowerCase() === 'x';
            const parsed = Number.parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
            if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 0x10ffff) {
                return entity;
            }
            return String.fromCodePoint(parsed);
        }
        return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
    });
}
