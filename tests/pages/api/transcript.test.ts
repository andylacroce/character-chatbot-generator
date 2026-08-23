import type { NextApiRequest, NextApiResponse } from 'next';

jest.mock('../../../src/utils/logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import handler, { isValidAvatarUrl } from '../../../pages/api/transcript';

function makeRes() {
    const res: Partial<NextApiResponse> & { headersSent: boolean } = { headersSent: false };
    res.status = jest.fn().mockReturnValue(res as NextApiResponse);
    res.json = jest.fn().mockReturnValue(res as NextApiResponse);
    res.send = jest.fn().mockReturnValue(res as NextApiResponse);
    res.end = jest.fn().mockReturnValue(res as NextApiResponse);
    res.setHeader = jest.fn();
    return res as NextApiResponse & { headersSent: boolean };
}

function makeReq(body: unknown, method = 'POST') {
    return {
        method,
        body,
        headers: { 'x-forwarded-for': `10.1.0.${Math.floor(Math.random() * 250) + 1}` },
        socket: { remoteAddress: '10.1.0.1' },
    } as unknown as NextApiRequest;
}

/** The HTML string handed to res.send. */
function sentHtml(res: NextApiResponse): string {
    return (res.send as jest.Mock).mock.calls[0][0];
}

const messages = [
    { sender: 'User', text: 'Hello' },
    { sender: 'Ada Lovelace', text: 'Greetings.' },
];

describe('transcript API', () => {
    beforeEach(() => jest.clearAllMocks());

    it('accepts a 10mb body so long transcripts are not truncated', () => {
        const { config } = jest.requireActual('../../../pages/api/transcript');
        expect(config.api.bodyParser.sizeLimit).toBe('10mb');
    });

    it('returns 405 for non-POST methods', async () => {
        const res = makeRes();
        await handler(makeReq({}, 'GET'), res);

        expect(res.setHeader).toHaveBeenCalledWith('Allow', ['POST']);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    it('stops after the rate limiter has already responded', async () => {
        const res = makeRes();
        res.headersSent = true;
        await handler(makeReq({ messages }), res);

        expect(res.send).not.toHaveBeenCalled();
    });

    describe('validation', () => {
        it.each([
            ['a non-array messages field', { messages: 'nope' }, 'Messages array required'],
            ['a missing messages field', {}, 'Messages array required'],
            ['a non-object bot', { messages, bot: 'Ada' }, 'bot must be an object'],
            ['a null-prototype bot value', { messages, bot: 42 }, 'bot must be an object'],
            ['a bot without a string name', { messages, bot: { name: 1, avatarUrl: '/a.png' } }, 'bot.name must be a string'],
            ['a bot without a string avatarUrl', { messages, bot: { name: 'Ada', avatarUrl: 1 } }, 'bot.avatarUrl must be a string'],
            ['a message that is not an object', { messages: ['hi'] }, 'Invalid message format'],
            ['a null message', { messages: [null] }, 'Invalid message format'],
            ['a message without a sender', { messages: [{ text: 'hi' }] }, 'Invalid message format'],
            ['a message without text', { messages: [{ sender: 'User' }] }, 'Invalid message format'],
        ])('rejects %s', async (_label, body, error) => {
            const res = makeRes();
            await handler(makeReq(body), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error });
        });

        it('rejects more than 10000 messages', async () => {
            const many = Array.from({ length: 10001 }, () => ({ sender: 'User', text: 'x' }));
            const res = makeRes();
            await handler(makeReq({ messages: many }), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'Too many messages (max 10000)' });
        });

        it('rejects a payload larger than 5MB', async () => {
            const big = [{ sender: 'User', text: 'x'.repeat(5 * 1024 * 1024 + 1) }];
            const res = makeRes();
            await handler(makeReq({ messages: big }), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'Transcript too large (max 5MB)' });
        });

        it('treats an undefined bot as absent rather than invalid', async () => {
            const res = makeRes();
            await handler(makeReq({ messages, bot: undefined }), res);

            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('rendering', () => {
        it('returns an HTML document with both speakers', async () => {
            const res = makeRes();
            await handler(makeReq({ messages, exportedAt: 'August 23, 2026' }), res);

            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
            expect(res.status).toHaveBeenCalledWith(200);
            const html = sentHtml(res);
            expect(html).toContain('<!DOCTYPE html>');
            expect(html).toContain('August 23, 2026');
            expect(html).toContain('Me:');
            expect(html).toContain('Ada Lovelace');
            expect(html).toContain('Greetings.');
        });

        it('generates a timestamp when the client does not supply one', async () => {
            const res = makeRes();
            await handler(makeReq({ messages }), res);

            expect(sentHtml(res)).toMatch(/<strong>Exported:<\/strong>\s*\S/);
        });

        it('renders the bot header and avatar when a bot is supplied', async () => {
            const res = makeRes();
            await handler(makeReq({ messages, bot: { name: 'Ada Lovelace', avatarUrl: '/avatars/ada.png' } }), res);

            const html = sentHtml(res);
            expect(html).toContain('<img src="/avatars/ada.png"');
            expect(html).toContain('<h2>Ada Lovelace</h2>');
        });

        it('drops an avatar whose URL is not a safe scheme', async () => {
            const res = makeRes();
            await handler(
                makeReq({ messages, bot: { name: 'Ada', avatarUrl: 'javascript:alert(1)' } }),
                res,
            );

            const html = sentHtml(res);
            expect(html).not.toContain('javascript:alert(1)');
            expect(html).not.toContain('<img');
        });

        it('escapes HTML in the bot name, message text and timestamp', async () => {
            const res = makeRes();
            await handler(
                makeReq({
                    messages: [{ sender: '<b>User</b>', text: '<img src=x onerror=alert(1)>' }],
                    bot: { name: '<script>alert(1)</script>', avatarUrl: '/a.png' },
                    exportedAt: '<script>bad()</script>',
                }),
                res,
            );

            const html = sentHtml(res);
            expect(html).not.toContain('<script>alert(1)</script>');
            expect(html).not.toContain('<script>bad()</script>');
            expect(html).not.toContain('<img src=x onerror=alert(1)>');
            expect(html).toContain('&lt;script&gt;');
        });

        it('escapes a non-user sender name when no bot is supplied', async () => {
            const res = makeRes();
            await handler(makeReq({ messages: [{ sender: '<b>Ada</b>', text: 'hi' }] }), res);

            const html = sentHtml(res);
            expect(html).not.toContain('<b>Ada</b>');
            expect(html).toContain('&lt;b&gt;Ada&lt;/b&gt;');
        });

        it('renders an empty transcript without failing', async () => {
            const res = makeRes();
            await handler(makeReq({ messages: [] }), res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(sentHtml(res)).toContain('<div class="messages">');
        });
    });
});

describe('isValidAvatarUrl', () => {
    it.each([
        ['an absolute path', '/avatars/ada.png'],
        ['a bare relative filename', 'silhouette.svg'],
        ['an https URL', 'https://example.com/a.png'],
        ['an http URL', 'http://example.com/a.png'],
        ['a base64 image data URL, as generated avatars use', 'data:image/png;base64,AAAA'],
        ['an uppercase data URL', 'DATA:IMAGE/JPEG;BASE64,AAAA'],
    ])('accepts %s', (_label, url) => {
        expect(isValidAvatarUrl(url)).toBe(true);
    });

    it.each([
        ['a javascript URL with an authority', 'javascript://alert(1)'],
        ['a bare javascript URL', 'javascript:alert(1)'],
        ['a vbscript URL', 'vbscript:msgbox(1)'],
        ['an SVG data URL, which can carry its own markup', 'data:image/svg+xml;base64,AAAA'],
        ['a non-image data URL', 'data:text/html;base64,AAAA'],
        ['an empty string', ''],
        ['an ftp URL', 'ftp://example.com/a.png'],
        ['a non-string value', 42 as unknown as string],
        ['a malformed absolute URL', 'https://%%%'],
    ])('rejects %s', (_label, url) => {
        expect(isValidAvatarUrl(url)).toBe(false);
    });
});
