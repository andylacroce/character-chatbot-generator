import { normalizeClaudeConfig, fetchVoiceConfigFromClaude, mapGenderToSsml, detectVoiceType, CHARACTER_VOICE_MAP } from '../../src/utils/characterVoices';

const createMock = jest.fn();
class AnthropicMock {
    messages = { create: createMock };
    constructor() {}
}
jest.mock('@anthropic-ai/sdk', () => ({ default: AnthropicMock, __esModule: true }));

jest.mock('../../src/utils/claudeModelSelector', () => ({ getClaudeModel: jest.fn(() => 'test-model') }));

const mockGetTTSClient = jest.fn();
jest.mock('../../src/utils/tts', () => ({ getTTSClient: () => mockGetTTSClient() }));

describe('characterVoices - helpers and Claude/TTS interactions', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    it('normalizeClaudeConfig clamps pitch and rate to allowed ranges', () => {
        const cfg = normalizeClaudeConfig({ pitch: 100, rate: 0.1, gender: 'female', languageCode: 'en-US', voiceName: 'foo' });
        expect(cfg.pitch).toBe(20); // clamped to 20
        expect(cfg.rate).toBe(0.25); // clamped to 0.25
        expect(cfg.gender).toBe('female');
    });

    it('fetchVoiceConfigFromClaude retries when voice name malformed and succeeds', async () => {
        // first call returns malformed voiceName
        createMock.mockResolvedValueOnce({ content: [{ type: "text", text: '{"voiceName":"badname","languageCode":"en-US","gender":"male","pitch":0,"rate":1}' }] })
            // second call returns valid voiceName
            .mockResolvedValueOnce({ content: [{ type: "text", text: '{"voiceName":"en-US-Wavenet-D","languageCode":"en-US","gender":"male","pitch":2,"rate":1.2}' }] });

        // mock tts client to succeed
        const ttsClient = { synthesizeSpeech: jest.fn().mockResolvedValue([{ audioContent: 'abc' }]) };
        mockGetTTSClient.mockReturnValue(ttsClient);

        const result = await fetchVoiceConfigFromClaude('Test Name');
        expect(result.voiceName).toBe('en-US-Wavenet-D');
        expect(result.languageCode).toBe('en-US');
        expect(result.pitch).toBe(2);
        expect(result.rate).toBe(1.2);
    });

    it('fetchVoiceConfigFromClaude throws when TTS validation fails after retries', async () => {
        // make Claude return a valid sounding response
        createMock.mockResolvedValue({ content: [{ type: "text", text: '{"voiceName":"en-US-Wavenet-D","languageCode":"en-US","gender":"male","pitch":0,"rate":1}' }] });

        // mock tts client to fail
        const ttsClient = { synthesizeSpeech: jest.fn().mockRejectedValue(new Error('voice missing')) };
        mockGetTTSClient.mockReturnValue(ttsClient);

        await expect(fetchVoiceConfigFromClaude('Someone', 2)).rejects.toThrow(/No valid voice found|failed/i);
    });

    it('getVoiceConfigForCharacter falls back to default on fetch error', async () => {
        // force Claude to throw to simulate fetch failure
        createMock.mockImplementation(() => { throw new Error('claude fail'); });
        const mod = jest.requireActual('../../src/utils/characterVoices');
        const res = await mod.getVoiceConfigForCharacter('Xyz');
        expect(res).toEqual(CHARACTER_VOICE_MAP['Default']);
    });

    it('mapGenderToSsml and detectVoiceType work', () => {
        expect(mapGenderToSsml('female')).toBe(2);
        expect(mapGenderToSsml('neutral')).toBe(0);
        expect(mapGenderToSsml('male')).toBe(1);
        expect(detectVoiceType('en-US-Studio-A')).toBe('Studio');
        expect(detectVoiceType('en-US-Wavenet-A')).toBe('Wavenet');
        expect(detectVoiceType('en-US-Neural2-A')).toBe('Neural2');
        expect(detectVoiceType('something-else')).toBe('Standard');
    });

    it('normalizeClaudeConfig falls back to defaults for missing gender, languageCode, voiceName', () => {
        // Exercises the || fallback branches: gender || "male", languageCode || "en-US", voiceName || ""
        const cfg = normalizeClaudeConfig({});
        expect(cfg.gender).toBe('male');
        expect(cfg.languageCode).toBe('en-US');
        expect(cfg.voiceName).toBe('');
        expect(cfg.pitch).toBe(0);
        expect(cfg.rate).toBe(1.0);
    });

    it('normalizeClaudeConfig falls back to 0 and 1.0 for non-numeric pitch and rate', () => {
        // Exercises the typeof !== 'number' branches for pitch and rate
        const cfg = normalizeClaudeConfig({
            gender: 'female',
            languageCode: 'en-GB',
            voiceName: 'en-GB-Wavenet-A',
            pitch: 'high' as unknown as number,
            rate: 'slow' as unknown as number,
        });
        expect(cfg.pitch).toBe(0);
        expect(cfg.rate).toBe(1.0);
    });

    it('fetchVoiceConfigFromClaude covers non-Error exception in catch (String(err) branch)', async () => {
        // Throw a non-Error to exercise: err instanceof Error ? ... : String(err)
        createMock.mockRejectedValue('plain string failure');
        await expect(fetchVoiceConfigFromClaude('Test Name', 1)).rejects.toBe('plain string failure');
    });

    it('fetchVoiceConfigFromClaude returns with fallback when content[0] is not text type', async () => {
        // Non-text content returns '{}' → JSON.parse fails with invalid voice → retries exhaust
        createMock.mockResolvedValue({
            content: [{ type: 'image' }]
        });
        const ttsClient = { synthesizeSpeech: jest.fn().mockRejectedValue(new Error('voice missing')) };
        mockGetTTSClient.mockReturnValue(ttsClient);
        await expect(fetchVoiceConfigFromClaude('Test', 1)).rejects.toThrow();
    });

    it('isValidGoogleTTSVoice covers non-Error in catch (L93 cond-expr[1])', async () => {
            // TTS throws a non-Error (string) to trigger String(err) branch in isValidGoogleTTSVoice
            const ttsClient = { synthesizeSpeech: jest.fn().mockRejectedValue('plain tts failure') };
            mockGetTTSClient.mockReturnValue(ttsClient);
            createMock.mockResolvedValue({
                content: [{ type: 'text', text: '{"voiceName":"en-US-Wavenet-D","languageCode":"en-US","gender":"male","pitch":0,"rate":1}' }]
            });
            // All retries will fail validation (TTS throws) → eventually rejects
            await expect(fetchVoiceConfigFromClaude('Test', 1)).rejects.toThrow();
        });
});
