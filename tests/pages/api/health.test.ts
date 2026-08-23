import type { NextApiRequest, NextApiResponse } from 'next';

const mockAnthropicCreate = jest.fn();
jest.mock('../../../src/utils/anthropicClient', () => ({
    __esModule: true,
    default: { messages: { create: (...args: unknown[]) => mockAnthropicCreate(...args) } },
}));

const mockSynthesizeSpeech = jest.fn();
const mockTtsClientCtor = jest.fn();
jest.mock('@google-cloud/text-to-speech', () => ({
    __esModule: true,
    default: {
        TextToSpeechClient: function TextToSpeechClientMock(opts: unknown) {
            mockTtsClientCtor(opts);
            return { synthesizeSpeech: (...args: unknown[]) => mockSynthesizeSpeech(...args) };
        },
    },
    protos: {
        google: {
            cloud: {
                texttospeech: {
                    v1: { SsmlVoiceGender: { MALE: 1 }, AudioEncoding: { MP3: 2 } },
                },
            },
        },
    },
}));

const mockGoogleAuth = jest.fn();
jest.mock('google-auth-library', () => ({
    GoogleAuth: function GoogleAuthMock(opts: unknown) {
        mockGoogleAuth(opts);
        return { kind: 'auth' };
    },
}));

const mockReadFileSync = jest.fn();
jest.mock('fs', () => ({
    __esModule: true,
    default: { readFileSync: (...args: unknown[]) => mockReadFileSync(...args) },
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
}));

const mockLogEvent = jest.fn();
jest.mock('../../../src/utils/logger', () => ({
    __esModule: true,
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    generateRequestId: () => 'generated-id',
    logEvent: (...args: unknown[]) => mockLogEvent(...args),
    sanitizeLogMeta: (m: unknown) => m,
}));

import handler from '../../../pages/api/health';

const SERVICE_ACCOUNT = JSON.stringify({
    client_email: 'test@test.iam.gserviceaccount.com',
    private_key: 'fake-key',
});

function makeRes() {
    const res: Partial<NextApiResponse> = {};
    res.status = jest.fn().mockReturnValue(res as NextApiResponse);
    res.json = jest.fn().mockReturnValue(res as NextApiResponse);
    return res as NextApiResponse;
}

function makeReq(headers: Record<string, string> = {}) {
    return { headers } as unknown as NextApiRequest;
}

function claudeHealthy() {
    mockAnthropicCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'pong' }] });
}

function ttsHealthy() {
    mockSynthesizeSpeech.mockResolvedValueOnce([{ audioContent: Buffer.from('audio') }]);
}

describe('health API', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...OLD_ENV, GOOGLE_APPLICATION_CREDENTIALS_JSON: SERVICE_ACCOUNT };
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('returns 200 when both Claude and TTS respond', async () => {
        claudeHealthy();
        ttsHealthy();
        const res = makeRes();
        await handler(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ status: 'ok', requestId: 'generated-id' });
    });

    it('echoes a caller-supplied request id', async () => {
        claudeHealthy();
        ttsHealthy();
        const res = makeRes();
        await handler(makeReq({ 'x-request-id': 'caller-id' }), res);

        expect(res.json).toHaveBeenCalledWith({ status: 'ok', requestId: 'caller-id' });
    });

    it('builds an explicit auth client from the service account credentials', async () => {
        claudeHealthy();
        ttsHealthy();
        await handler(makeReq(), makeRes());

        expect(mockGoogleAuth).toHaveBeenCalledWith(
            expect.objectContaining({
                credentials: expect.objectContaining({ client_email: 'test@test.iam.gserviceaccount.com' }),
            }),
        );
    });

    it('reads credentials from disk when the env var holds a path', async () => {
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = '/secrets/sa.json';
        mockReadFileSync.mockReturnValueOnce(SERVICE_ACCOUNT);
        claudeHealthy();
        ttsHealthy();
        const res = makeRes();
        await handler(makeReq(), res);

        expect(mockReadFileSync).toHaveBeenCalledWith('/secrets/sa.json', 'utf8');
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('falls back to application default credentials when the key material is incomplete', async () => {
        process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify({ project_id: 'p' });
        claudeHealthy();
        ttsHealthy();
        const res = makeRes();
        await handler(makeReq(), res);

        expect(mockGoogleAuth).not.toHaveBeenCalled();
        expect(mockTtsClientCtor).toHaveBeenCalledWith(undefined);
        expect(mockLogEvent).toHaveBeenCalledWith(
            'info',
            'health_tts_adc_fallback',
            expect.any(String),
            expect.any(Object),
        );
        expect(res.status).toHaveBeenCalledWith(200);
    });

    it('reports a Claude failure as 500 with the error message', async () => {
        mockAnthropicCreate.mockRejectedValueOnce(new Error('anthropic down'));
        ttsHealthy();
        const res = makeRes();
        await handler(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                status: 'error',
                claude: { status: 'error', error: 'anthropic down' },
                tts: { status: 'ok', error: null },
            }),
        );
    });

    it('treats a non-text Claude response as unhealthy', async () => {
        mockAnthropicCreate.mockResolvedValueOnce({ content: [{ type: 'image' }] });
        ttsHealthy();
        const res = makeRes();
        await handler(makeReq(), res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                claude: { status: 'error', error: 'No valid Claude response' },
            }),
        );
    });

    it('reports missing TTS credentials as unhealthy', async () => {
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
        claudeHealthy();
        const res = makeRes();
        await handler(makeReq(), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                tts: { status: 'error', error: 'Missing GOOGLE_APPLICATION_CREDENTIALS_JSON' },
            }),
        );
    });

    it('treats an empty TTS response as unhealthy', async () => {
        claudeHealthy();
        mockSynthesizeSpeech.mockResolvedValueOnce([{ audioContent: null }]);
        const res = makeRes();
        await handler(makeReq(), res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                tts: { status: 'error', error: 'No audio content from TTS' },
            }),
        );
    });

    it('stringifies non-Error throws from both probes', async () => {
        mockAnthropicCreate.mockRejectedValueOnce('claude string throw');
        mockSynthesizeSpeech.mockRejectedValueOnce('tts string throw');
        const res = makeRes();
        await handler(makeReq(), res);

        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                claude: { status: 'error', error: 'claude string throw' },
                tts: { status: 'error', error: 'tts string throw' },
            }),
        );
    });

    it('omits the verbose error logs in production', async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
        mockAnthropicCreate.mockRejectedValueOnce(new Error('anthropic down'));
        ttsHealthy();
        await handler(makeReq(), makeRes());
        Object.defineProperty(process.env, 'NODE_ENV', { value: originalNodeEnv, configurable: true });

        const events = mockLogEvent.mock.calls.map((c) => c[1]);
        expect(events).not.toContain('health_claude_error');
        expect(events).toContain('health_claude_failed');
    });
});
