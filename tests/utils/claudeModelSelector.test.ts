import { getClaudeModel } from '../../src/utils/claudeModelSelector';

describe('getClaudeModel', () => {
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

    describe('"text" type', () => {
        it('returns claude-sonnet-4-6 in production', () => {
            setEnv({ NODE_ENV: 'production', VERCEL_ENV: undefined });
            expect(getClaudeModel('text')).toBe('claude-sonnet-4-6');
        });

        it('returns claude-haiku-4-5-20251001 in development', () => {
            setEnv({ NODE_ENV: 'development', VERCEL_ENV: undefined });
            expect(getClaudeModel('text')).toBe('claude-haiku-4-5-20251001');
        });

        it('returns claude-sonnet-4-6 when VERCEL_ENV is production', () => {
            setEnv({ NODE_ENV: 'development', VERCEL_ENV: 'production' });
            expect(getClaudeModel('text')).toBe('claude-sonnet-4-6');
        });
    });

    describe('"text-simple" type', () => {
        it('always returns claude-haiku-4-5-20251001 in production', () => {
            setEnv({ NODE_ENV: 'production', VERCEL_ENV: undefined });
            expect(getClaudeModel('text-simple')).toBe('claude-haiku-4-5-20251001');
        });

        it('always returns claude-haiku-4-5-20251001 in development', () => {
            setEnv({ NODE_ENV: 'development', VERCEL_ENV: undefined });
            expect(getClaudeModel('text-simple')).toBe('claude-haiku-4-5-20251001');
        });
    });

    describe('"image" type', () => {
        it('returns imagen-3.0-fast-generate-001 in any environment', () => {
            setEnv({ NODE_ENV: 'production', VERCEL_ENV: undefined });
            expect(getClaudeModel('image')).toEqual({ primary: 'imagen-3.0-fast-generate-001' });

            setEnv({ NODE_ENV: 'development', VERCEL_ENV: undefined });
            expect(getClaudeModel('image')).toEqual({ primary: 'imagen-3.0-fast-generate-001' });
        });
    });

    it('throws on unknown type', () => {
        // @ts-expect-error test: passing invalid type should throw
        expect(() => getClaudeModel('audio')).toThrow('Unknown model type: audio');
    });
});
