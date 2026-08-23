import type { NextApiRequest, NextApiResponse } from 'next';

const mockLogEvent = jest.fn();
jest.mock('../../../src/utils/logger', () => ({
    default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
    logEvent: (...args: unknown[]) => mockLogEvent(...args),
    sanitizeLogMeta: (m: unknown) => m,
}));

const mockGeneratePersonalityPrompt = jest.fn();
jest.mock('../../../src/config/serverConfig', () => ({
    generatePersonalityPrompt: (...args: unknown[]) => mockGeneratePersonalityPrompt(...args),
}));

import handler from '../../../pages/api/generate-personality';

function makeRes() {
    const res: Partial<NextApiResponse> = { headersSent: false };
    res.status = jest.fn().mockReturnValue(res as NextApiResponse);
    res.json = jest.fn().mockReturnValue(res as NextApiResponse);
    res.end = jest.fn().mockReturnValue(res as NextApiResponse);
    res.setHeader = jest.fn();
    return res as NextApiResponse;
}

function makeReq(body: unknown, method = 'POST') {
    return {
        method,
        body,
        headers: { 'x-forwarded-for': `10.0.0.${Math.floor(Math.random() * 250) + 1}` },
        socket: { remoteAddress: '10.0.0.1' },
    } as unknown as NextApiRequest;
}

describe('generate-personality API', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 405 for non-POST methods', async () => {
        const res = makeRes();
        await handler(makeReq({}, 'GET'), res);

        expect(res.status).toHaveBeenCalledWith(405);
        expect(mockGeneratePersonalityPrompt).not.toHaveBeenCalled();
    });

    it.each([
        ['a missing name', {}],
        ['a non-string name', { name: 42 }],
        ['an empty name', { name: '' }],
    ])('returns 400 for %s', async (_label, body) => {
        const res = makeRes();
        await handler(makeReq(body), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'Valid name required' });
    });

    it('returns 400 when sanitizing strips the name to nothing', async () => {
        // sanitizeCharacterName removes < > ' " & — a name made only of those is empty after.
        const res = makeRes();
        await handler(makeReq({ name: '<<>>&"' }), res);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({ error: 'Invalid character name' });
        expect(mockGeneratePersonalityPrompt).not.toHaveBeenCalled();
    });

    it('returns the generated personality and the sanitized name', async () => {
        mockGeneratePersonalityPrompt.mockResolvedValueOnce('You are Ada Lovelace.');
        const res = makeRes();
        await handler(makeReq({ name: '  Ada Lovelace  ' }), res);

        expect(mockGeneratePersonalityPrompt).toHaveBeenCalledWith('Ada Lovelace');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({
            personality: 'You are Ada Lovelace.',
            correctedName: 'Ada Lovelace',
        });
    });

    it('returns 500 and logs when generation throws', async () => {
        mockGeneratePersonalityPrompt.mockRejectedValueOnce(new Error('claude exploded'));
        const res = makeRes();
        await handler(makeReq({ name: 'Ada Lovelace' }), res);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith({ error: 'Failed to generate personality prompt' });
        expect(mockLogEvent).toHaveBeenCalledWith(
            'error',
            'personality_prompt_error',
            expect.any(String),
            expect.objectContaining({ error: 'claude exploded' }),
        );
    });

    it('stops after the rate limiter has already responded', async () => {
        const res = makeRes();
        (res as { headersSent: boolean }).headersSent = true;
        await handler(makeReq({ name: 'Ada Lovelace' }), res);

        expect(mockGeneratePersonalityPrompt).not.toHaveBeenCalled();
    });
});
