import { BadGatewayException } from '@nestjs/common';
import { createHash } from 'crypto';
import { detectSourceKind, parseNovelSource } from 'src/crawl/novel-url';

export type ChapterListEntry = {
    siteId: string;
    title: string;
};

export type FreeChapterList = {
    chapters: ChapterListEntry[];
    vipCount: number;
};

const HOMEPAGE_URL = 'https://sangtacviet.com/';
const CHAPTER_LIST_API = 'https://sangtacviet.com/index.php?ngmar=chapterlist&h={h}&bookid={bookid}&sajax=getchapterlist';
const CHAPTER_FREE_STATUS = '1';
const REQUEST_TIMEOUT_MS = 30_000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const WIKICV_PAGE_SIZE = 501;

type ChapterListPayload = {
    code?: unknown;
    data?: unknown;
};

/**
 * Gọi API chapterlist của sangtacviet bằng HTTP thường (không dùng Playwright).
 * Mở trang chủ trước để lấy cookie phiên, rồi trả về danh sách chương miễn phí.
 */
export async function fetchFreeChapterList(novelUrl: string): Promise<FreeChapterList> {
    if (detectSourceKind(novelUrl) === 'wikicv') {
        return fetchWikicvChapterList(novelUrl);
    }
    const { source, bookId } = parseNovelSource(novelUrl);
    const cookie = await openSession();
    const apiUrl = CHAPTER_LIST_API.replace('{h}', encodeURIComponent(source)).replace('{bookid}', encodeURIComponent(bookId));

    const response = await request(apiUrl, { cookie, referer: novelUrl });
    if (!response.ok) {
        throw new BadGatewayException(`Trang nguồn trả HTTP ${response.status}. Thử lại sau.`);
    }

    const body = (await response.text()).trim();
    if (!body) {
        throw new BadGatewayException('Trang nguồn trả danh sách chương rỗng. Có thể đang chặn tạm thời, thử lại sau.');
    }

    let payload: ChapterListPayload;
    try {
        payload = JSON.parse(body) as ChapterListPayload;
    } catch {
        throw new BadGatewayException('Không đọc được danh sách chương từ trang nguồn.');
    }

    if (Number(payload.code) !== 1 || typeof payload.data !== 'string') {
        throw new BadGatewayException('Trang nguồn báo lỗi khi lấy danh sách chương.');
    }

    return parseChapterListData(payload.data);
}

async function openSession(): Promise<string> {
    const response = await request(HOMEPAGE_URL, { referer: HOMEPAGE_URL });
    if (!response.ok) {
        throw new BadGatewayException(`Không mở được trang nguồn (HTTP ${response.status}).`);
    }
    await response.text();
    return collectCookies(response);
}

async function request(url: string, init: { cookie?: string; referer: string }): Promise<Response> {
    const headers: Record<string, string> = {
        'user-agent': USER_AGENT,
        'x-requested-with': 'XMLHttpRequest',
        accept: 'application/json, text/javascript, */*; q=0.01',
        referer: init.referer,
    };
    if (init.cookie) {
        headers.cookie = init.cookie;
    }
    try {
        return await fetch(url, { headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new BadGatewayException(`Không kết nối được trang nguồn: ${message}`);
    }
}

function collectCookies(response: Response): string {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const fromGetSetCookie = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [];
    const fallback = response.headers.get('set-cookie');
    const values = fromGetSetCookie.length > 0 ? fromGetSetCookie : fallback ? [fallback] : [];
    return values
        .map((value) => value.split(';')[0]?.trim())
        .filter((value): value is string => Boolean(value))
        .join('; ');
}

function parseChapterListData(raw: string): FreeChapterList {
    const chapters: ChapterListEntry[] = [];
    let vipCount = 0;

    for (const entry of raw.split('-//-')) {
        const trimmed = entry.trim();
        if (!trimmed) {
            continue;
        }
        const parts = trimmed.split('-/-', 3);
        if (parts.length < 3) {
            continue;
        }
        const status = parts[0].trim();
        const siteId = parts[1].trim();
        const title = parts[2].replace(/\s+/g, ' ').trim();
        if (!siteId) {
            continue;
        }
        if (status !== CHAPTER_FREE_STATUS) {
            vipCount += 1;
            continue;
        }
        chapters.push({ siteId, title });
    }

    return { chapters, vipCount };
}

/**
 * Danh sách chương của wikicv lấy qua `/book/index` (AJAX) với chữ ký `sign`
 * tính từ `bookId`/`signKey` nhúng trong trang truyện.
 */
async function fetchWikicvChapterList(novelUrl: string): Promise<FreeChapterList> {
    const base = new URL(novelUrl).origin;
    const novelHtml = await fetchWikicvHtml(novelUrl, novelUrl);
    const bookId = matchOrThrow(novelHtml, /var bookId\s*=\s*"([^"]+)"/, 'bookId');
    const signKey = matchOrThrow(novelHtml, /var signKey\s*=\s*"([^"]+)"/, 'signKey');

    const chapters: ChapterListEntry[] = [];
    const seen = new Set<string>();
    const visited = new Set<number>();
    const pending: number[] = [0];

    while (pending.length > 0) {
        const start = pending.shift() as number;
        if (visited.has(start)) {
            continue;
        }
        visited.add(start);

        const sign = wikicvChapterSign(signKey, start, WIKICV_PAGE_SIZE);
        const apiUrl = `${base}/book/index?bookId=${encodeURIComponent(bookId)}` + `&start=${start}&size=${WIKICV_PAGE_SIZE}` + `&signKey=${encodeURIComponent(signKey)}&sign=${sign}`;
        const html = await fetchWikicvHtml(apiUrl, novelUrl);

        for (const match of html.matchAll(/<a[^>]+href="([^"]*\/chuong-[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi)) {
            const siteId = decodeHtmlEntities(match[1]).trim();
            if (!siteId || seen.has(siteId)) {
                continue;
            }
            const title = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ' '))
                .replace(/\s+/g, ' ')
                .trim();
            if (!title) {
                continue;
            }
            seen.add(siteId);
            chapters.push({ siteId, title });
        }

        for (const match of html.matchAll(/data-start="(\d+)"/g)) {
            const next = Number(match[1]);
            if (Number.isInteger(next) && !visited.has(next) && !pending.includes(next)) {
                pending.push(next);
            }
        }
    }

    if (chapters.length === 0) {
        throw new BadGatewayException('Trang nguồn trả danh sách chương rỗng.');
    }

    return { chapters, vipCount: 0 };
}

async function fetchWikicvHtml(url: string, referer: string): Promise<string> {
    let response: Response;
    try {
        response = await fetch(url, {
            headers: {
                'user-agent': USER_AGENT,
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'accept-language': 'vi,en;q=0.9',
                referer,
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

function wikicvChapterSign(signKey: string, start: number, size: number): string {
    const raw = `${signKey}${start}${size}`;
    const rotated = raw.length > 81 ? raw.slice(81) + raw.slice(0, 81) : raw;
    return createHash('sha256').update(rotated, 'utf8').digest('hex');
}

function matchOrThrow(html: string, pattern: RegExp, label: string): string {
    const match = pattern.exec(html);
    if (!match) {
        throw new BadGatewayException(`Không đọc được ${label} từ trang truyện.`);
    }
    return match[1];
}

function decodeHtmlEntities(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0*39;/g, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&nbsp;/g, ' ');
}
