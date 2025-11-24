import { getOpenAIModel } from '../src/utils/openaiModelSelector';

describe('getOpenAIModel', () => {
    const OLD_ENV = process.env;
    beforeEach(() => {
        jest.resetModules();
        process.env = { ...OLD_ENV };
    });
    afterAll(() => {
        process.env = OLD_ENV;
    });

    function setEnv(env: Partial<NodeJS.ProcessEnv>) {
        for (const key of Object.keys(env)) {
            Object.defineProperty(process.env, key, {
                value: env[key],
                configurable: true,
                writable: true,
                enumerable: true,
            });
        }
    }

    it('returns gpt-4o for text in production', () => {
        setEnv({ NODE_ENV: 'production', VERCEL_ENV: undefined });
        expect(getOpenAIModel('text')).toBe('gpt-4o');
    });

    it('returns gpt-4o for text in development', () => {
        setEnv({ NODE_ENV: 'development', VERCEL_ENV: undefined });
        expect(getOpenAIModel('text')).toBe('gpt-4o');
    });

    it('returns gpt-4o for text if VERCEL_ENV is production', () => {
        setEnv({ NODE_ENV: 'development', VERCEL_ENV: 'production' });
        expect(getOpenAIModel('text')).toBe('gpt-4o');
    });

    it('returns correct image models in production', () => {
        setEnv({ NODE_ENV: 'production', VERCEL_ENV: undefined });
        expect(getOpenAIModel('image')).toEqual({ primary: 'gpt-image-1', fallback: 'dall-e-3' });
    });

    it('returns correct image models in development', () => {
        setEnv({ NODE_ENV: 'development', VERCEL_ENV: undefined });
        expect(getOpenAIModel('image')).toEqual({ primary: 'dall-e-2', fallback: 'dall-e-3' });
    });

    it('throws on unknown type', () => {
        // @ts-expect-error test: passing invalid type should throw
        expect(() => getOpenAIModel('audio')).toThrow('Unknown OpenAI model type: audio');
    });
});
