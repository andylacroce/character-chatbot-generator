import { normalizeOpenAIConfig, fetchVoiceConfigFromOpenAI, mapGenderToSsml, detectVoiceType, CHARACTER_VOICE_MAP } from '../../src/utils/characterVoices';

const createMock = jest.fn();
class OpenAIMock {
  chat = { completions: { create: createMock } };
  constructor() {}
}
jest.mock('openai', () => ({ default: OpenAIMock, __esModule: true }));

jest.mock('../../src/utils/openaiModelSelector', () => ({ getOpenAIModel: jest.fn(() => 'test-model') }));

const mockGetTTSClient = jest.fn();
jest.mock('../../src/utils/tts', () => ({ getTTSClient: () => mockGetTTSClient() }));

describe('characterVoices - helpers and OpenAI/TTS interactions', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('normalizeOpenAIConfig clamps pitch and rate to allowed ranges', () => {
    const cfg = normalizeOpenAIConfig({ pitch: 100, rate: 0.1, gender: 'female', languageCode: 'en-US', voiceName: 'foo' });
    expect(cfg.pitch).toBe(20); // clamped to 20
    expect(cfg.rate).toBe(0.25); // clamped to 0.25
    expect(cfg.gender).toBe('female');
  });

  it('fetchVoiceConfigFromOpenAI retries when voice name malformed and succeeds', async () => {
    // first call returns malformed voiceName
    createMock.mockResolvedValueOnce({ choices: [{ message: { content: '{"voiceName":"badname","languageCode":"en-US","gender":"male","pitch":0,"rate":1}' } }] })
      // second call returns valid voiceName
      .mockResolvedValueOnce({ choices: [{ message: { content: '{"voiceName":"en-US-Wavenet-D","languageCode":"en-US","gender":"male","pitch":2,"rate":1.2}' } }] });

    // mock tts client to succeed
    const ttsClient = { synthesizeSpeech: jest.fn().mockResolvedValue([{ audioContent: 'abc' }]) };
    mockGetTTSClient.mockReturnValue(ttsClient);

    const result = await fetchVoiceConfigFromOpenAI('Test Name');
    expect(result.voiceName).toBe('en-US-Wavenet-D');
    expect(result.languageCode).toBe('en-US');
    expect(result.pitch).toBe(2);
    expect(result.rate).toBe(1.2);
  });

  it('fetchVoiceConfigFromOpenAI throws when TTS validation fails after retries', async () => {
    // make OpenAI return a valid sounding response
    createMock.mockResolvedValue({ choices: [{ message: { content: '{"voiceName":"en-US-Wavenet-D","languageCode":"en-US","gender":"male","pitch":0,"rate":1}' } }] });

    // mock tts client to fail
    const ttsClient = { synthesizeSpeech: jest.fn().mockRejectedValue(new Error('voice missing')) };
    mockGetTTSClient.mockReturnValue(ttsClient);

    await expect(fetchVoiceConfigFromOpenAI('Someone', 2)).rejects.toThrow(/No valid voice found|failed/i);
  });

  it('getVoiceConfigForCharacter falls back to default on fetch error', async () => {
    // force OpenAI to throw to simulate fetch failure
    createMock.mockImplementation(() => { throw new Error('openai fail'); });
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
});