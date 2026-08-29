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
                    v1: { SsmlVoiceGender: { MALE: 1, FEMALE: 2, NEUTRAL: 3 }, AudioEncoding: { MP3: 2 } },
                },
            },
        },
    },
}));

const mockGoogleAuthCtor = jest.fn();
jest.mock('google-auth-library', () => ({
    GoogleAuth: function GoogleAuthMock(opts: unknown) {
        mockGoogleAuthCtor(opts);
        return { kind: 'google-auth' };
    },
}));

const mockWriteFileSync = jest.fn();
const mockReadFileSync = jest.fn();
jest.mock('fs', () => ({
    __esModule: true,
    default: {
        writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
        readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    },
}));

const mockLoggerInfo = jest.fn();
jest.mock('../../src/utils/logger', () => ({
    __esModule: true,
    default: { info: (...args: unknown[]) => mockLoggerInfo(...args), warn: jest.fn(), error: jest.fn() },
    sanitizeLogMeta: (m: unknown) => m,
}));

import os from 'os';
import path from 'path';
import * as tts from '../../src/utils/tts';

const TMP = os.tmpdir();
const OUT = path.join(TMP, 'reply.mp3');
const CREDS = { client_email: 'test@test.iam.gserviceaccount.com', private_key: 'fake-key' };

function audioReturned(content = Buffer.from('audio-bytes')) {
    mockSynthesizeSpeech.mockResolvedValueOnce([{ audioContent: content }]);
}

describe('tts', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useRealTimers();
        process.env = { ...OLD_ENV };
        // Singleton client state leaks across tests otherwise.
        tts.__resetSingletonsForTest(() => CREDS);
    });

    afterAll(() => {
        process.env = OLD_ENV;
        tts.__resetSingletonsForTest(null);
    });

    describe('getTTSClient', () => {
        it('builds one client from explicit credentials and reuses it', () => {
            const first = tts.getTTSClient();
            const second = tts.getTTSClient();

            expect(first).toBe(second);
            expect(mockTtsClientCtor).toHaveBeenCalledTimes(1);
            expect(mockGoogleAuthCtor).toHaveBeenCalledWith(
                expect.objectContaining({
                    credentials: CREDS,
                    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
                }),
            );
        });

        it('falls back to application default credentials when the key material is incomplete', () => {
            tts.__resetSingletonsForTest(() => ({ project_id: 'p' }));
            tts.getTTSClient();

            expect(mockGoogleAuthCtor).not.toHaveBeenCalled();
            expect(mockTtsClientCtor).toHaveBeenCalledWith(undefined);
            expect(mockLoggerInfo).toHaveBeenCalledWith(expect.stringContaining('Application Default Credentials'));
        });

        it('falls back to ADC when credential loading throws', () => {
            tts.__resetSingletonsForTest(() => {
                throw new Error('no credentials here');
            });
            tts.getTTSClient();

            expect(mockTtsClientCtor).toHaveBeenCalledWith(undefined);
        });

        it('falls back to ADC when credentials are not an object', () => {
            tts.__resetSingletonsForTest(() => 'not-an-object');
            tts.getTTSClient();

            expect(mockTtsClientCtor).toHaveBeenCalledWith(undefined);
        });
    });

    describe('getGoogleAuthCredentials', () => {
        beforeEach(() => tts.__resetSingletonsForTest(null));

        it('throws when the credentials env var is absent', () => {
            delete process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

            expect(() => tts.getGoogleAuthCredentials()).toThrow(
                'Missing GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable',
            );
        });

        it('parses inline JSON on Vercel', () => {
            process.env.VERCEL_ENV = 'production';
            process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = JSON.stringify(CREDS);

            expect(tts.getGoogleAuthCredentials()).toEqual(CREDS);
            expect(mockReadFileSync).not.toHaveBeenCalled();
        });

        it('reads an absolute credentials path locally', () => {
            delete process.env.VERCEL_ENV;
            process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = '/secrets/sa.json';
            mockReadFileSync.mockReturnValueOnce(JSON.stringify(CREDS));

            expect(tts.getGoogleAuthCredentials()).toEqual(CREDS);
            expect(mockReadFileSync).toHaveBeenCalledWith(path.normalize('/secrets/sa.json'), 'utf8');
        });

        it('resolves a relative credentials path against the working directory', () => {
            delete process.env.VERCEL_ENV;
            process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON = 'secrets/sa.json';
            mockReadFileSync.mockReturnValueOnce(JSON.stringify(CREDS));

            tts.getGoogleAuthCredentials();

            expect(mockReadFileSync).toHaveBeenCalledWith(
                path.join(process.cwd(), 'secrets/sa.json'),
                'utf8',
            );
        });
    });

    describe('synthesizeSpeechToFile', () => {
        it('writes the returned audio to the requested file', async () => {
            const content = Buffer.from('audio-bytes');
            audioReturned(content);

            await tts.synthesizeSpeechToFile({ text: 'hello', filePath: OUT });

            expect(mockWriteFileSync).toHaveBeenCalledWith(OUT, content, 'binary');
            expect(mockLoggerInfo).toHaveBeenCalledWith(
                'Audio file created',
                expect.objectContaining({ event: 'audio_create' }),
            );
        });

        it('sends plain text as text input', async () => {
            audioReturned();
            await tts.synthesizeSpeechToFile({ text: 'hello', filePath: OUT });

            expect(mockSynthesizeSpeech.mock.calls[0][0].input).toEqual({ text: 'hello' });
        });

        it('sends SSML as ssml input', async () => {
            audioReturned();
            await tts.synthesizeSpeechToFile({ text: '<speak>hi</speak>', filePath: OUT, ssml: true });

            expect(mockSynthesizeSpeech.mock.calls[0][0].input).toEqual({ ssml: '<speak>hi</speak>' });
        });

        it('translates languageCodes into the singular languageCode the API expects', async () => {
            audioReturned();
            await tts.synthesizeSpeechToFile({
                text: 'hello',
                filePath: OUT,
                voice: { languageCodes: ['en-US'], name: 'en-US-Studio-O' },
            });

            const { voice } = mockSynthesizeSpeech.mock.calls[0][0];
            expect(voice.languageCode).toBe('en-US');
            expect(voice.languageCodes).toBeUndefined();
        });

        it('defaults the language when the voice omits it', async () => {
            audioReturned();
            await tts.synthesizeSpeechToFile({
                text: 'hello',
                filePath: OUT,
                voice: { name: 'some-voice' },
            });

            expect(mockSynthesizeSpeech.mock.calls[0][0].voice.languageCode).toBe('en-GB');
        });

        it('strips ssmlGender when it is NEUTRAL and a specific voice name is given, since Google rejects that combination outright', async () => {
            audioReturned();
            await tts.synthesizeSpeechToFile({
                text: 'hello',
                filePath: OUT,
                voice: { languageCodes: ['en-US'], name: 'en-US-Neural2-C', ssmlGender: 3 },
            });

            const { voice } = mockSynthesizeSpeech.mock.calls[0][0];
            expect(voice.name).toBe('en-US-Neural2-C');
            expect(voice.ssmlGender).toBeUndefined();
            expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(1);
        });

        it('keeps a non-neutral ssmlGender alongside a specific voice name', async () => {
            audioReturned();
            await tts.synthesizeSpeechToFile({
                text: 'hello',
                filePath: OUT,
                voice: { languageCodes: ['en-US'], name: 'en-US-Neural2-C', ssmlGender: 2 },
            });

            expect(mockSynthesizeSpeech.mock.calls[0][0].voice.ssmlGender).toBe(2);
        });

        describe('output path safety', () => {
            it('rejects a relative path', async () => {
                await expect(
                    tts.synthesizeSpeechToFile({ text: 'hi', filePath: 'reply.mp3' }),
                ).rejects.toThrow('filePath must be an absolute path');
                expect(mockWriteFileSync).not.toHaveBeenCalled();
            });

            it('rejects a non-mp3 extension', async () => {
                await expect(
                    tts.synthesizeSpeechToFile({ text: 'hi', filePath: path.join(TMP, 'reply.wav') }),
                ).rejects.toThrow('Output file must have .mp3 extension');
            });

            it('rejects an output directory outside the system temp directory', async () => {
                await expect(
                    tts.synthesizeSpeechToFile({ text: 'hi', filePath: '/etc/reply.mp3' }),
                ).rejects.toThrow('Invalid output directory: must reside under system temp');
                expect(mockWriteFileSync).not.toHaveBeenCalled();
            });

            it('rejects a traversal that escapes the temp directory after normalising', async () => {
                await expect(
                    tts.synthesizeSpeechToFile({
                        text: 'hi',
                        filePath: path.join(TMP, '..', '..', 'etc', 'reply.mp3'),
                    }),
                ).rejects.toThrow('Invalid output directory: must reside under system temp');
            });

            it('allows a nested directory under the system temp directory', async () => {
                audioReturned();
                const nested = path.join(TMP, 'audio', 'reply.mp3');
                await tts.synthesizeSpeechToFile({ text: 'hi', filePath: nested });

                expect(mockWriteFileSync).toHaveBeenCalledWith(nested, expect.anything(), 'binary');
            });
        });

        describe('retries', () => {
            it('retries a transient failure and succeeds', async () => {
                mockSynthesizeSpeech.mockRejectedValueOnce(new Error('transient'));
                audioReturned();

                await tts.synthesizeSpeechToFile({ text: 'hi', filePath: OUT });

                expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(2);
                expect(mockWriteFileSync).toHaveBeenCalled();
            });

            it('gives up after three attempts and rethrows the last error', async () => {
                mockSynthesizeSpeech.mockRejectedValue(new Error('always down'));

                await expect(
                    tts.synthesizeSpeechToFile({ text: 'hi', filePath: OUT }),
                ).rejects.toThrow('always down');
                expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(3);
                expect(mockWriteFileSync).not.toHaveBeenCalled();
            });

            it('treats a response without audio content as a failure', async () => {
                mockSynthesizeSpeech.mockResolvedValue([{ audioContent: null }]);

                await expect(
                    tts.synthesizeSpeechToFile({ text: 'hi', filePath: OUT }),
                ).rejects.toThrow('TTS API response is missing audioContent');
                expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(3);
            });

            it('treats an empty response tuple as a failure', async () => {
                mockSynthesizeSpeech.mockResolvedValue([undefined]);

                await expect(
                    tts.synthesizeSpeechToFile({ text: 'hi', filePath: OUT }),
                ).rejects.toThrow('TTS API response is missing audioContent');
            });
        });

        describe('gender mismatch self-heal', () => {
            it('retries once with the corrected ssmlGender parsed from a gender-mismatch error, without consuming the transient-failure budget', async () => {
                mockSynthesizeSpeech.mockRejectedValueOnce(
                    new Error('Requested male voice, but voice en-US-Neural2-C is a female voice.'),
                );
                audioReturned();

                await tts.synthesizeSpeechToFile({
                    text: 'hi',
                    filePath: OUT,
                    voice: { languageCodes: ['en-US'], name: 'en-US-Neural2-C', ssmlGender: 1 },
                });

                expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(2);
                expect(mockSynthesizeSpeech.mock.calls[1][0].voice.ssmlGender).toBe(2); // FEMALE
                expect(mockWriteFileSync).toHaveBeenCalled();
            });

            it('only self-heals once, then falls back to the normal retry budget if it still fails', async () => {
                mockSynthesizeSpeech
                    .mockRejectedValueOnce(
                        new Error('Requested male voice, but voice en-US-Neural2-C is a female voice.'),
                    )
                    .mockRejectedValueOnce(new Error('still broken'));
                audioReturned();

                await tts.synthesizeSpeechToFile({
                    text: 'hi',
                    filePath: OUT,
                    voice: { languageCodes: ['en-US'], name: 'en-US-Neural2-C', ssmlGender: 1 },
                });

                expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(3);
                expect(mockWriteFileSync).toHaveBeenCalled();
            });

            it('does not treat an unrelated error as a gender mismatch', async () => {
                mockSynthesizeSpeech.mockRejectedValue(new Error('network error'));

                await expect(
                    tts.synthesizeSpeechToFile({
                        text: 'hi',
                        filePath: OUT,
                        voice: { languageCodes: ['en-US'], name: 'en-US-Neural2-C', ssmlGender: 1 },
                    }),
                ).rejects.toThrow('network error');
                expect(mockSynthesizeSpeech).toHaveBeenCalledTimes(3);
            });
        });
    });

    describe('__resetSingletonsForTest', () => {
        it('clears the cached client so the next call rebuilds it', () => {
            tts.getTTSClient();
            tts.__resetSingletonsForTest(() => CREDS);
            tts.getTTSClient();

            expect(mockTtsClientCtor).toHaveBeenCalledTimes(2);
        });

        it('removes a previously installed credential override', () => {
            tts.__resetSingletonsForTest(() => CREDS);
            tts.__resetSingletonsForTest(null);
            delete process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

            expect(() => tts.getGoogleAuthCredentials()).toThrow(/Missing GOOGLE_APPLICATION_CREDENTIALS_JSON/);
        });
    });
});
