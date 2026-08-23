import type { NextApiRequest, NextApiResponse } from 'next';

const mockAccess = jest.fn();
const mockUnlink = jest.fn();
jest.mock('fs/promises', () => ({
    __esModule: true,
    default: {
        access: (...args: unknown[]) => mockAccess(...args),
        unlink: (...args: unknown[]) => mockUnlink(...args),
    },
}));

const mockLogEvent = jest.fn();
jest.mock('../../../src/utils/logger', () => ({
    logEvent: (...args: unknown[]) => mockLogEvent(...args),
    sanitizeLogMeta: (m: unknown) => m,
}));

import handler from '../../../pages/api/delete-audio';

function makeRes() {
    const res: Partial<NextApiResponse> = {};
    res.status = jest.fn().mockReturnValue(res as NextApiResponse);
    res.json = jest.fn().mockReturnValue(res as NextApiResponse);
    return res as NextApiResponse;
}

function makeReq(file: unknown) {
    return { query: { file } } as unknown as NextApiRequest;
}

describe('delete-audio API', () => {
    beforeEach(() => jest.clearAllMocks());

    it('deletes a simple filename under /tmp', async () => {
        mockAccess.mockResolvedValueOnce(undefined);
        mockUnlink.mockResolvedValueOnce(undefined);
        const res = makeRes();
        await handler(makeReq('reply-123.mp3'), res);

        expect(mockUnlink).toHaveBeenCalledWith('/tmp/reply-123.mp3');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ message: 'File deleted' });
    });

    describe('path traversal', () => {
        it.each([
            ['a missing file param', undefined],
            ['a non-string file param', ['a.mp3']],
            ['an empty filename', ''],
            ['a parent-directory escape', '../etc/passwd'],
            ['a nested parent-directory escape', 'sub/../../etc/passwd'],
            ['an absolute path', '/etc/passwd'],
        ])('rejects %s with 400 and never touches the filesystem', async (_label, file) => {
            const res = makeRes();
            await handler(makeReq(file), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'Invalid file specified' });
            expect(mockAccess).not.toHaveBeenCalled();
            expect(mockUnlink).not.toHaveBeenCalled();
        });
    });

    it('returns 404 when the file does not exist', async () => {
        const enoent = Object.assign(new Error('missing'), { code: 'ENOENT' });
        mockAccess.mockRejectedValueOnce(enoent);
        const res = makeRes();
        await handler(makeReq('gone.mp3'), res);

        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith({ error: 'File not found' });
    });

    it('returns 500 for any other filesystem error', async () => {
        mockAccess.mockResolvedValueOnce(undefined);
        mockUnlink.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));
        const res = makeRes();
        await handler(makeReq('locked.mp3'), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Error deleting file' });
        expect(mockLogEvent).toHaveBeenCalledWith(
            'error',
            'delete_audio_internal_error',
            expect.any(String),
            expect.objectContaining({ error: 'denied' }),
        );
    });

    it('returns 500 when a non-Error value is thrown', async () => {
        mockAccess.mockRejectedValueOnce('just a string');
        const res = makeRes();
        await handler(makeReq('weird.mp3'), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(mockLogEvent).toHaveBeenCalledWith(
            'error',
            'delete_audio_internal_error',
            expect.any(String),
            expect.objectContaining({ error: 'just a string' }),
        );
    });
});
