import { createHash } from 'crypto';
import { fetchFreeChapterList } from './novel-chapters-sync';

function rotate(value: string, size: number): string {
    return value.length > size ? value.slice(size) + value.slice(0, size) : value;
}

describe('fetchFreeChapterList (wikicv)', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
    });

    it('signs the chapter list with the fuzzySign rotation from the page', async () => {
        const pageHtml = `
            <script>
                var bookId = "6a7b8c9d";
                function fuzzySign(text) {
                    return text.substring(58) + text.substring(0, 58);
                }
                var signKey = "0123456789abcdef";
            </script>`;
        const indexHtml = '<a href="/truyen/truyen-a/chuong-1-abc">Chương 1</a>';
        const requested: string[] = [];

        global.fetch = jest.fn(async (input: string | URL | Request) => {
            const url = String(input);
            requested.push(url);
            const body = url.includes('/book/index?') ? indexHtml : pageHtml;
            return { ok: true, status: 200, text: async () => body } as Response;
        }) as typeof fetch;

        const result = await fetchFreeChapterList('https://wikicv.org/truyen/truyen-a');

        expect(result.chapters).toEqual([{ siteId: '/truyen/truyen-a/chuong-1-abc', title: 'Chương 1' }]);
        const expectedSign = createHash('sha256').update(rotate('0123456789abcdef0501', 58), 'utf8').digest('hex');
        expect(requested[1]).toContain(`sign=${expectedSign}`);
    });
});
