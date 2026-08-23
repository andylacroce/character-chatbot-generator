import type { NextApiRequest, NextApiResponse } from 'next';

const mockSynthesizeSpeechToFile = jest.fn();
jest.mock('../../../src/utils/tts', () => ({
    synthesizeSpeechToFile: (...args: unknown[]) => mockSynthesizeSpeechToFile(...args),
}));

const mockFs = {
    // Each implementation declares its parameters so the inferred mock signature
    // accepts the path argument the forwarders below pass through.
    existsSync: jest.fn((_p: string): boolean => false),
    realpathSync: jest.fn((p: string): string => p),
    readFileSync: jest.fn((_p: string): string | Buffer => ''),
    writeFileSync: jest.fn((_p: string, _data: string, _encoding?: string): void => {}),
};
// Forwarded lazily because the factory runs while the handler is being required.
jest.mock('fs', () => ({
    __esModule: true,
    default: {
        existsSync: (...a: unknown[]) => mockFs.existsSync(...(a as [string])),
        realpathSync: (...a: unknown[]) => mockFs.realpathSync(...(a as [string])),
        readFileSync: (...a: unknown[]) => mockFs.readFileSync(...(a as [string])),
        writeFileSync: (...a: unknown[]) => mockFs.writeFileSync(...(a as [string, string, string])),
    },
}));

const mockGetReplyCache = jest.fn();
jest.mock('../../../src/utils/cache', () => ({
    getReplyCache: (...args: unknown[]) => mockGetReplyCache(...args),
}));

const mockLogEvent = jest.fn();
jest.mock('../../../src/utils/logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    logEvent: (...args: unknown[]) => mockLogEvent(...args),
    sanitizeLogMeta: (m: unknown) => m,
}));

const mockGetVoiceConfigForCharacter = jest.fn();
jest.mock('../../../src/utils/characterVoices', () => ({
    getVoiceConfigForCharacter: (...args: unknown[]) => mockGetVoiceConfigForCharacter(...args),
}));

const mockCreate = jest.fn();
jest.mock('../../../src/utils/anthropicClient', () => ({
    __esModule: true,
    default: { messages: { create: (...a: unknown[]) => mockCreate(...a) } },
}));

import os from 'os';
import path from 'path';

const handler = require('../../../pages/api/audio').default as (
    req: NextApiRequest,
    res: NextApiResponse,
) => Promise<void>;

const TMP = os.tmpdir();
const PUBLIC = path.join(process.cwd(), 'public');
const AUDIO = path.join(TMP, 'reply.mp3');
const TXT = path.join(TMP, 'reply.txt');
const voiceConfig = { languageCodes: ['en-GB'], name: 'en-GB-Wavenet-D', ssmlGender: 'MALE' };

function makeRes() {
    const res: Partial<NextApiResponse> & { headersSent: boolean } = { headersSent: false };
    res.status = jest.fn().mockReturnValue(res as NextApiResponse);
    res.json = jest.fn().mockReturnValue(res as NextApiResponse);
    res.send = jest.fn().mockReturnValue(res as NextApiResponse);
    res.setHeader = jest.fn();
    return res as NextApiResponse & { headersSent: boolean };
}

function makeReq(query: Record<string, unknown> = {}) {
    return {
        method: 'GET',
        headers: { 'x-forwarded-for': `10.3.0.${Math.floor(Math.random() * 250) + 1}` },
        socket: { remoteAddress: '10.3.0.1' },
        query: { file: 'reply.mp3', ...query },
    } as unknown as NextApiRequest;
}

/** Makes only the listed absolute paths exist on the fake filesystem. */
function onDisk(paths: string[]) {
    mockFs.existsSync.mockImplementation((p: string) => paths.includes(p));
}

describe('audio API', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        onDisk([]);
        mockFs.realpathSync.mockImplementation((p: string) => p);
        mockFs.readFileSync.mockReturnValue('');
        mockGetReplyCache.mockReturnValue(undefined);
        mockGetVoiceConfigForCharacter.mockResolvedValue(voiceConfig);
        mockSynthesizeSpeechToFile.mockResolvedValue(undefined);
    });

    describe('request handling', () => {
        it('stops after the rate limiter has already responded', async () => {
            const res = makeRes();
            res.headersSent = true;
            await handler(makeReq(), res);

            expect(res.send).not.toHaveBeenCalled();
        });

        it.each([
            ['missing', undefined],
            ['an array', ['a.mp3', 'b.mp3']],
        ])('returns 400 when the file param is %s', async (_label, file) => {
            const res = makeRes();
            await handler(makeReq({ file }), res);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'File parameter is required' });
        });

        it('serves a cached file whose sidecar text matches', async () => {
            onDisk([AUDIO, TXT]);
            mockFs.readFileSync.mockImplementation((p: string) =>
                p === TXT ? 'Greetings.' : Buffer.from('audio-bytes'),
            );
            const res = makeRes();
            await handler(makeReq({ text: 'Greetings.' }), res);

            expect(mockSynthesizeSpeechToFile).not.toHaveBeenCalled();
            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'audio/mpeg');
            expect(res.send).toHaveBeenCalledWith(Buffer.from('audio-bytes'));
        });

        it('serves a file that only exists under public/', async () => {
            const publicFile = path.join(PUBLIC, 'reply.mp3');
            onDisk([publicFile]);
            mockFs.readFileSync.mockReturnValue(Buffer.from('public-audio'));
            const res = makeRes();
            await handler(makeReq(), res);

            expect(res.send).toHaveBeenCalledWith(Buffer.from('public-audio'));
        });

        it('returns 500 when the audio file cannot be read', async () => {
            onDisk([AUDIO, TXT]);
            mockFs.readFileSync.mockImplementation((p: string) => {
                if (p === TXT) return 'Greetings.';
                throw new Error('unreadable');
            });
            const res = makeRes();
            await handler(makeReq({ text: 'Greetings.' }), res);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ error: 'Error reading file' });
        });

        it('returns 404 when nothing can be produced', async () => {
            mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '' }] });
            const res = makeRes();
            await handler(makeReq(), res);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({
                error: 'File not found after all regeneration attempts',
            });
        });
    });

    describe('path containment', () => {
        it('strips any directory component from the file param', async () => {
            onDisk([AUDIO, TXT]);
            mockFs.readFileSync.mockImplementation((p: string) =>
                p === TXT ? 'Greetings.' : Buffer.from('audio-bytes'),
            );
            const res = makeRes();
            await handler(makeReq({ file: '../../etc/reply.mp3', text: 'Greetings.' }), res);

            expect(res.send).toHaveBeenCalled();
            expect(mockFs.readFileSync).not.toHaveBeenCalledWith(
                expect.stringContaining('etc'),
                expect.anything(),
            );
        });

        it('refuses a temp file that resolves outside the temp directory', async () => {
            // A symlink planted in the temp directory: the path is inside, but
            // realpath() points elsewhere. The sibling public path does not exist,
            // which is exactly the case the old && condition let through.
            onDisk([AUDIO, TXT]);
            mockFs.realpathSync.mockImplementation((p: string) =>
                p === AUDIO ? '/etc/shadow' : p,
            );
            mockFs.readFileSync.mockReturnValue('Greetings.');
            const res = makeRes();
            await handler(makeReq({ text: 'Greetings.' }), res);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith({ error: 'Access forbidden' });
            expect(res.send).not.toHaveBeenCalled();
        });

        it('refuses a public file that resolves outside public/', async () => {
            const publicFile = path.join(PUBLIC, 'reply.mp3');
            onDisk([publicFile]);
            mockFs.realpathSync.mockImplementation((p: string) =>
                p === publicFile ? '/etc/shadow' : p,
            );
            const res = makeRes();
            await handler(makeReq(), res);

            expect(res.status).toHaveBeenCalledWith(403);
        });

        it('allows a temp path whose root itself is a symlink', async () => {
            // macOS: os.tmpdir() is /var/folders/... while realpath() returns
            // /private/var/folders/..., so the root has to be resolved too.
            onDisk([AUDIO, TXT, '/private' + AUDIO]);
            mockFs.realpathSync.mockImplementation((p: string) =>
                p.startsWith(TMP) ? '/private' + p : p,
            );
            mockFs.readFileSync.mockImplementation((p: string) =>
                p === TXT ? 'Greetings.' : Buffer.from('audio-bytes'),
            );
            const res = makeRes();
            await handler(makeReq({ text: 'Greetings.' }), res);

            expect(res.status).not.toHaveBeenCalledWith(403);
            expect(res.send).toHaveBeenCalledWith(Buffer.from('audio-bytes'));
        });
    });

    describe('voice configuration', () => {
        it('uses the voice config supplied in the query string', async () => {
            onDisk([]);
            const custom = { languageCodes: ['en-US'], name: 'en-US-Studio-O', ssmlGender: 'FEMALE' };
            mockFs.existsSync.mockImplementation((p: string) => p === AUDIO);
            const res = makeRes();
            await handler(
                makeReq({ text: 'Greetings.', voiceConfig: JSON.stringify(custom) }),
                res,
            );

            expect(mockGetVoiceConfigForCharacter).not.toHaveBeenCalled();
            expect(mockSynthesizeSpeechToFile).toHaveBeenCalledWith(
                expect.objectContaining({ voice: expect.objectContaining({ name: 'en-US-Studio-O' }) }),
            );
        });

        it('looks the voice up when the query config is unparseable', async () => {
            mockFs.existsSync.mockImplementation((p: string) => p === AUDIO);
            await handler(makeReq({ text: 'Greetings.', voiceConfig: 'not json' }), makeRes());

            expect(mockGetVoiceConfigForCharacter).toHaveBeenCalledWith('Character', null);
        });

        it('passes the bot name and gender through to the voice lookup', async () => {
            mockFs.existsSync.mockImplementation((p: string) => p === AUDIO);
            await handler(makeReq({ text: 'Greetings.', botName: 'Ada', gender: 'female' }), makeRes());

            expect(mockGetVoiceConfigForCharacter).toHaveBeenCalledWith('Ada', 'female');
        });
    });

    describe('regeneration', () => {
        it('synthesizes when the sidecar text does not match the requested text', async () => {
            mockFs.existsSync.mockImplementation((p: string) => p === TXT || p === AUDIO);
            mockFs.readFileSync.mockImplementation((p: string) =>
                p === TXT ? 'A stale reply.' : Buffer.from('audio-bytes'),
            );
            const res = makeRes();
            await handler(makeReq({ text: 'A fresh reply.' }), res);

            expect(mockSynthesizeSpeechToFile).toHaveBeenCalledWith(
                expect.objectContaining({ filePath: AUDIO, ssml: true }),
            );
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(TXT, 'A fresh reply.', 'utf8');
            expect(res.send).toHaveBeenCalled();
        });

        it('synthesizes when no sidecar text exists at all', async () => {
            mockFs.existsSync.mockImplementation((p: string) => p === AUDIO);
            mockFs.readFileSync.mockReturnValue(Buffer.from('audio-bytes'));
            const res = makeRes();
            await handler(makeReq({ text: 'Greetings.' }), res);

            expect(mockSynthesizeSpeechToFile).toHaveBeenCalled();
            expect(res.send).toHaveBeenCalled();
        });

        it('returns 404 when synthesis from the text param fails', async () => {
            onDisk([]);
            mockSynthesizeSpeechToFile.mockRejectedValueOnce(new Error('tts exploded'));
            const res = makeRes();
            await handler(makeReq({ text: 'Greetings.' }), res);

            expect(mockLogEvent).toHaveBeenCalledWith(
                'error',
                'audio_synthesis_failed',
                expect.any(String),
                expect.objectContaining({ error: 'tts exploded' }),
            );
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('regenerates from the sidecar text when only the audio is missing', async () => {
            // No `text` param: the handler recovers the original wording from the
            // .txt file left next to the (now absent) mp3.
            let synthesized = false;
            mockFs.existsSync.mockImplementation((p: string) => p === TXT || (synthesized && p === AUDIO));
            mockFs.readFileSync.mockImplementation((p: string) =>
                p === TXT ? 'The original reply.' : Buffer.from('audio-bytes'),
            );
            mockSynthesizeSpeechToFile.mockImplementation(async () => {
                synthesized = true;
            });
            const res = makeRes();
            await handler(makeReq(), res);

            expect(mockSynthesizeSpeechToFile).toHaveBeenCalledWith(
                expect.objectContaining({ filePath: AUDIO, ssml: true }),
            );
            expect(mockCreate).not.toHaveBeenCalled();
            expect(res.send).toHaveBeenCalledWith(Buffer.from('audio-bytes'));
        });

        it('falls back to the reply cache when no sidecar text exists', async () => {
            let synthesized = false;
            mockGetReplyCache.mockReturnValue('A cached reply.');
            mockFs.existsSync.mockImplementation((p: string) => synthesized && p === AUDIO);
            mockFs.readFileSync.mockReturnValue(Buffer.from('audio-bytes'));
            mockSynthesizeSpeechToFile.mockImplementation(async () => {
                synthesized = true;
            });
            const res = makeRes();
            await handler(makeReq(), res);

            expect(mockGetReplyCache).toHaveBeenCalledWith('reply.mp3');
            expect(mockCreate).not.toHaveBeenCalled();
            expect(res.send).toHaveBeenCalled();
        });

        it('falls back to Claude when there is no text to re-speak', async () => {
            mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'An improvised reply.' }] });
            await handler(makeReq(), makeRes());

            expect(mockCreate).toHaveBeenCalled();
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(TXT, 'An improvised reply.', 'utf8');
        });

        it('retries the Claude fallback three times before giving up', async () => {
            mockCreate.mockRejectedValue(new Error('claude down'));
            const res = makeRes();
            await handler(makeReq(), res);

            expect(mockCreate).toHaveBeenCalledTimes(3);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('treats an empty Claude reply as a failed attempt', async () => {
            mockCreate.mockResolvedValue({ content: [{ type: 'image' }] });
            const res = makeRes();
            await handler(makeReq(), res);

            expect(mockCreate).toHaveBeenCalledTimes(3);
            expect(res.status).toHaveBeenCalledWith(404);
        });

        it('serves the file once a Claude-driven regen lands it on disk', async () => {
            mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'An improvised reply.' }] });
            let synthesized = false;
            mockFs.existsSync.mockImplementation((p: string) => synthesized && p === AUDIO);
            mockSynthesizeSpeechToFile.mockImplementation(async () => {
                synthesized = true;
            });
            mockFs.readFileSync.mockReturnValue(Buffer.from('audio-bytes'));
            const res = makeRes();
            await handler(makeReq(), res);

            expect(mockLogEvent).toHaveBeenCalledWith(
                'info',
                'audio_regen_claude_success',
                expect.any(String),
                expect.any(Object),
            );
            expect(res.send).toHaveBeenCalledWith(Buffer.from('audio-bytes'));
        });
    });
});
