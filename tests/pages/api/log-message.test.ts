import type { NextApiRequest, NextApiResponse } from 'next';

const mockHead = jest.fn();
const mockPut = jest.fn();
// The error class is declared inside the factory: `import` statements are hoisted, so a
// class declared in the test body would still be uninitialised when the handler loads.
jest.mock('@vercel/blob', () => {
    class BlobNotFoundError extends Error {}
    return {
        BlobNotFoundError,
        head: (...args: unknown[]) => mockHead(...args),
        put: (...args: unknown[]) => mockPut(...args),
    };
});

const mockMkdirSync = jest.fn();
const mockAppendFileSync = jest.fn();
jest.mock('fs', () => ({
    __esModule: true,
    default: {
        mkdirSync: (...args: unknown[]) => mockMkdirSync(...args),
        appendFileSync: (...args: unknown[]) => mockAppendFileSync(...args),
    },
}));

const mockLogEvent = jest.fn();
const mockLoggerError = jest.fn();
jest.mock('../../../src/utils/logger', () => ({
    __esModule: true,
    default: { error: (...args: unknown[]) => mockLoggerError(...args), info: jest.fn(), warn: jest.fn() },
    generateRequestId: () => 'generated-id',
    logEvent: (...args: unknown[]) => mockLogEvent(...args),
    sanitizeLogMeta: (m: unknown) => m,
}));

import handler from '../../../pages/api/log-message';
import { BlobNotFoundError as MockBlobNotFoundError } from '@vercel/blob';

/** The mocked BlobNotFoundError; the real type declares a no-arg constructor. */
const blobNotFound = () =>
    new (MockBlobNotFoundError as unknown as new (message: string) => Error)('nope');

function makeRes() {
    const res: Partial<NextApiResponse> = {};
    res.status = jest.fn().mockReturnValue(res as NextApiResponse);
    res.json = jest.fn().mockReturnValue(res as NextApiResponse);
    res.end = jest.fn().mockReturnValue(res as NextApiResponse);
    res.setHeader = jest.fn();
    return res as NextApiResponse;
}

const validBody = {
    sender: 'User',
    text: 'hello there',
    sessionId: 'abcdef1234567890',
    sessionDatetime: '2026-08-23T10-00-00',
};

function makeReq(body: unknown, { method = 'POST', headers = {} as Record<string, string> } = {}) {
    return {
        method,
        body,
        headers,
        socket: { remoteAddress: '203.0.113.7' },
    } as unknown as NextApiRequest;
}

describe('log-message API', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...OLD_ENV };
        delete process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
        delete process.env.BLOB_READ_WRITE_TOKEN;
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('returns 405 for non-POST methods', async () => {
        const res = makeRes();
        await handler(makeReq(validBody, { method: 'GET' }), res);

        expect(res.setHeader).toHaveBeenCalledWith('Allow', ['POST']);
        expect(res.status).toHaveBeenCalledWith(405);
    });

    describe('input validation', () => {
        it.each([
            ['a missing sender', { ...validBody, sender: undefined }, 'Sender, text, sessionId, and sessionDatetime required'],
            ['an undefined text', { ...validBody, text: undefined }, 'Sender, text, sessionId, and sessionDatetime required'],
            ['a missing sessionId', { ...validBody, sessionId: undefined }, 'Sender, text, sessionId, and sessionDatetime required'],
            ['a missing sessionDatetime', { ...validBody, sessionDatetime: undefined }, 'Sender, text, sessionId, and sessionDatetime required'],
            ['an over-long sender', { ...validBody, sender: 'x'.repeat(101) }, 'Invalid sender'],
            ['a non-string sender', { ...validBody, sender: { toString: (): string => 'x' } }, 'Invalid sender'],
            ['an over-long text', { ...validBody, text: 'x'.repeat(2001) }, 'Invalid text'],
            ['a non-string text', { ...validBody, text: 12345 }, 'Invalid text'],
            ['an over-long sessionId', { ...validBody, sessionId: 'x'.repeat(101) }, 'Invalid sessionId'],
            ['a non-string sessionId', { ...validBody, sessionId: 99 }, 'Invalid sessionId'],
            ['an over-long sessionDatetime', { ...validBody, sessionDatetime: 'x'.repeat(31) }, 'Invalid sessionDatetime'],
            ['a non-string sessionDatetime', { ...validBody, sessionDatetime: 99 }, 'Invalid sessionDatetime'],
        ])('rejects %s', async (_label, body, error) => {
            const res = makeRes();
            await handler(makeReq(body), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error, requestId: 'generated-id' });
            expect(mockAppendFileSync).not.toHaveBeenCalled();
            expect(mockPut).not.toHaveBeenCalled();
        });

        it('accepts empty text', async () => {
            const res = makeRes();
            await handler(makeReq({ ...validBody, text: '' }), res);

            expect(res.status).toHaveBeenCalledWith(200);
        });
    });

    describe('local file storage', () => {
        it('appends the entry to a session-scoped log file', async () => {
            const res = makeRes();
            await handler(makeReq(validBody, { headers: { 'x-forwarded-for': '198.51.100.4, 10.0.0.1' } }), res);

            expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining('logs'), { recursive: true });
            const [filePath, entry, encoding] = mockAppendFileSync.mock.calls[0];
            expect(filePath).toContain('2026-08-23T10-00-00_session_abcdef12.log');
            expect(entry).toContain('[198.51.100.4]');
            expect(entry).toContain('User: hello there');
            expect(encoding).toBe('utf8');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ success: true, requestId: 'generated-id' });
        });

        it('falls back to the socket address when no forwarding header is present', async () => {
            await handler(makeReq(validBody), makeRes());

            expect(mockAppendFileSync.mock.calls[0][1]).toContain('[203.0.113.7]');
        });

        it('escapes HTML so stored logs cannot carry script payloads', async () => {
            await handler(
                makeReq({ ...validBody, sender: '<b>User</b>', text: '<script>alert(1)</script>' }),
                makeRes(),
            );

            const entry = mockAppendFileSync.mock.calls[0][1];
            expect(entry).not.toContain('<script>');
            expect(entry).toContain('&lt;script&gt;');
        });

        it('strips newlines so a message cannot forge extra log lines', async () => {
            await handler(
                makeReq({ ...validBody, text: 'line one\n[2020-01-01] [1.2.3.4] Admin: forged' }),
                makeRes(),
            );

            const entry = mockAppendFileSync.mock.calls[0][1];
            expect(entry.trimEnd().split('\n')).toHaveLength(1);
        });

        it('strips traversal characters out of the log filename', async () => {
            await handler(
                makeReq({ ...validBody, sessionDatetime: '../../etc', sessionId: '../../../x' }),
                makeRes(),
            );

            const filePath = mockAppendFileSync.mock.calls[0][0];
            expect(filePath).not.toContain('..');
            // The session id is truncated to 8 chars before stripping, so `../../../x`
            // leaves nothing behind at all.
            expect(filePath).toContain('etc_session_.log');
        });

        it('returns 500 when the write fails', async () => {
            mockAppendFileSync.mockImplementationOnce(() => {
                throw new Error('disk full');
            });
            const res = makeRes();
            await handler(makeReq(validBody), res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
            expect(mockLoggerError).toHaveBeenCalled();
        });
    });

    describe('Vercel Blob storage', () => {
        beforeEach(() => {
            process.env.VERCEL_BLOB_READ_WRITE_TOKEN = 'blob-token';
            global.fetch = jest.fn();
        });

        it('appends to the existing blob contents', async () => {
            mockHead.mockResolvedValueOnce({ downloadUrl: 'https://blob.example/log' });
            (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, text: async () => 'earlier line\n' });
            const res = makeRes();
            await handler(makeReq(validBody), res);

            const [name, content, opts] = mockPut.mock.calls[0];
            expect(name).toBe('2026-08-23T10-00-00_session_abcdef12.log');
            expect(content).toContain('earlier line\n');
            expect(content).toContain('User: hello there');
            expect(opts).toMatchObject({ allowOverwrite: true, addRandomSuffix: false, token: 'blob-token' });
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('starts a fresh log when the blob does not exist yet', async () => {
            mockHead.mockRejectedValueOnce(blobNotFound());
            const res = makeRes();
            await handler(makeReq(validBody), res);

            expect(mockPut.mock.calls[0][1]).toContain('User: hello there');
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('starts a fresh log when reading the existing blob fails', async () => {
            mockHead.mockResolvedValueOnce({ url: 'https://blob.example/log' });
            (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, text: async () => 'ignored' });
            const res = makeRes();
            await handler(makeReq(validBody), res);

            expect(mockPut.mock.calls[0][1]).not.toContain('ignored');
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('ignores a non-404 head error and still writes', async () => {
            mockHead.mockRejectedValueOnce({ status: 500 });
            const res = makeRes();
            await handler(makeReq(validBody), res);

            expect(mockPut).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(200);
        });

        it('returns 500 when the blob write fails', async () => {
            mockHead.mockRejectedValueOnce(blobNotFound());
            mockPut.mockRejectedValueOnce(new Error('blob down'));
            const res = makeRes();
            await handler(makeReq(validBody), res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error' });
        });

        it('honours the legacy BLOB_READ_WRITE_TOKEN name', async () => {
            delete process.env.VERCEL_BLOB_READ_WRITE_TOKEN;
            process.env.BLOB_READ_WRITE_TOKEN = 'legacy-token';
            mockHead.mockRejectedValueOnce(blobNotFound());
            await handler(makeReq(validBody), makeRes());

            expect(mockPut.mock.calls[0][2]).toMatchObject({ token: 'legacy-token' });
        });
    });

    it('returns 500 when the body cannot be destructured', async () => {
        const res = makeRes();
        await handler(makeReq(null), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Internal Server Error', requestId: 'generated-id' });
    });
});
