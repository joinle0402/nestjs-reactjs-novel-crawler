import { BadGatewayException } from '@nestjs/common';
import { parseNovelMetadata } from './novel-metadata';

const SANGTACVIET_URL = 'https://sangtacviet.com/truyen/fanqie/1/7275986706002627646/';
const WIKICV_URL = 'https://wikicv.org/truyen/cuong-the-nich-sung-aaezWVS4CCu7T2qh';

describe('parseNovelMetadata', () => {
    it('reads sangtacviet metadata from the server-rendered page', () => {
        const html = `
            <html><head>
                <meta property="og:title" content="Truyện A" />
                <meta property="og:image" content="http://cdn.example/cover.png" />
                <meta property="og:novel:author" content="Tác giả A" />
                <meta property="og:description" content="Mô tả ngắn" />
            </head><body>
                <h1 id="book_name2" class="cap">Truyện A &amp; phần 2</h1>
                <div id="book-sumary" class="blk-body">
                    <span>Đoạn 1<br>Đoạn 2 &#39;thử&#39;</span>
                </div>
            </body></html>`;

        expect(parseNovelMetadata(html, SANGTACVIET_URL)).toEqual({
            url: SANGTACVIET_URL,
            title: 'Truyện A & phần 2',
            author: 'Tác giả A',
            summary: "Đoạn 1\nĐoạn 2 'thử'",
            cover: 'http://cdn.example/cover.png',
        });
    });

    it('skips the sangtacviet placeholder cover', () => {
        const html = `
            <html><head>
                <meta property="og:title" content="Truyện A" />
                <meta property="og:image" content="http://static.sangtacvietcdn.xyz/img/bookcover256.jpg" />
            </head><body><div id="book-sumary"></div></body></html>`;

        expect(parseNovelMetadata(html, SANGTACVIET_URL).cover).toBe('');
    });

    it('reads wikicv metadata and resolves a relative cover', () => {
        const html = `
            <div class="book-info">
                <div class="cover-wrapper">
                    <img class="z-depth-1" src="/photo/69a82e3954b8083a0aab28a0?o=1" />
                </div>
                <div class="cover-info">
                    <div>
                        <h2 style="font-size: 1.7rem">Cường thế nịch sủng &amp; thử</h2>
                        <p>Hán Việt: <a href="/tim-kiem?q=abc">Hán Việt</a></p>
                        <p>Tác giả: <a href="/tac-gia/abc">Bất Nhị Đồ</a></p>
                    </div>
                </div>
                <div class="book-desc-detail">
                    <p>Song khiết</p>
                    <p>Đoạn hai</p>
                </div>
            </div>`;

        expect(parseNovelMetadata(html, WIKICV_URL)).toEqual({
            url: WIKICV_URL,
            title: 'Cường thế nịch sủng & thử',
            author: 'Bất Nhị Đồ',
            summary: 'Song khiết\nĐoạn hai',
            cover: 'https://wikicv.org/photo/69a82e3954b8083a0aab28a0?o=1',
        });
    });

    it('skips the wikicv default cover', () => {
        const html = `
            <div class="cover-wrapper"><img src="/static/img/default-cover.jpg" /></div>
            <div class="cover-info"><h2>Truyện B</h2></div>`;

        expect(parseNovelMetadata(html, WIKICV_URL).cover).toBe('');
    });

    it('throws when the page has no title', () => {
        expect(() => parseNovelMetadata('<html><body>chặn</body></html>', SANGTACVIET_URL)).toThrow(BadGatewayException);
    });
});
