// authOptions.ts statically imports @auth/drizzle-adapter, which ships pure ESM and
// pulls in drizzle-orm transitively — neither is on Jest's transformIgnorePatterns
// allowlist (kept narrow, matching this repo's convention of mocking external SDKs at
// the boundary rather than executing them for real). Mock both unconditionally so the
// real ESM modules are never parsed by Jest, regardless of which test runs.
const fakeDb = { __db: true };
jest.mock('../../../src/db/client', () => ({ getDb: () => fakeDb }));
const fakeAdapter = { __adapter: true };
const mockDrizzleAdapter = jest.fn().mockReturnValue(fakeAdapter);
jest.mock('@auth/drizzle-adapter', () => ({ DrizzleAdapter: (...args: unknown[]) => mockDrizzleAdapter(...args) }));

describe('auth/authOptions', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...OLD_ENV };
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('has no adapter when DATABASE_URL is not configured', async () => {
        await jest.isolateModulesAsync(async () => {
            delete process.env.DATABASE_URL;
            const { authOptions } = require('../../../src/auth/authOptions');
            expect(authOptions.adapter).toBeUndefined();
            expect(mockDrizzleAdapter).not.toHaveBeenCalled();
        });
    });

    it('attaches a Drizzle adapter when DATABASE_URL is configured', async () => {
        await jest.isolateModulesAsync(async () => {
            process.env.DATABASE_URL = 'postgres://user:pass@host/db';

            const { authOptions } = require('../../../src/auth/authOptions');

            expect(authOptions.adapter).toBe(fakeAdapter);
            expect(mockDrizzleAdapter).toHaveBeenCalledWith(fakeDb, expect.objectContaining({
                usersTable: expect.anything(),
                accountsTable: expect.anything(),
            }));
        });
    });

    describe('preview stub provider', () => {
        it('is absent when VERCEL_ENV is not "preview", leaving Google as the only provider', async () => {
            await jest.isolateModulesAsync(async () => {
                delete process.env.DATABASE_URL;
                delete process.env.VERCEL_ENV;
                const { authOptions } = require('../../../src/auth/authOptions');
                expect(authOptions.providers).toHaveLength(1);
                expect(authOptions.providers.some((p: { id: string; options?: { id?: string } }) => (p.options?.id ?? p.id) === 'preview-stub')).toBe(false);
                expect(authOptions.providers.some((p: { id: string }) => p.id === 'google')).toBe(true);
            });
        });

        it('is absent in production even if VERCEL_ENV were somehow "production"', async () => {
            await jest.isolateModulesAsync(async () => {
                delete process.env.DATABASE_URL;
                process.env.VERCEL_ENV = 'production';
                const { authOptions } = require('../../../src/auth/authOptions');
                expect(authOptions.providers.some((p: { id: string; options?: { id?: string } }) => (p.options?.id ?? p.id) === 'preview-stub')).toBe(false);
            });
        });

        it('replaces Google entirely (not adds alongside) when VERCEL_ENV is "preview"', async () => {
            await jest.isolateModulesAsync(async () => {
                delete process.env.DATABASE_URL;
                process.env.VERCEL_ENV = 'preview';
                const { authOptions } = require('../../../src/auth/authOptions');
                // Google is excluded on preview: it has no client_id configured there and
                // would just fail with SIGNIN_OAUTH_ERROR if offered alongside the stub.
                expect(authOptions.providers).toHaveLength(1);
                expect(authOptions.providers.some((p: { id: string; options?: { id?: string } }) => (p.options?.id ?? p.id) === 'preview-stub')).toBe(true);
                expect(authOptions.providers.some((p: { id: string }) => p.id === 'google')).toBe(false);
            });
        });

        it('authorize() returns an ephemeral identity for a valid email on preview', async () => {
            await jest.isolateModulesAsync(async () => {
                delete process.env.DATABASE_URL;
                process.env.VERCEL_ENV = 'preview';
                const { authOptions } = require('../../../src/auth/authOptions');
                const stub = authOptions.providers.find((p: { id: string; options?: { id?: string } }) => (p.options?.id ?? p.id) === 'preview-stub');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const user = await (stub as any).options.authorize({ email: 'Test@Example.com  ' });
                expect(user).toEqual({ id: 'test@example.com', email: 'test@example.com', name: 'test' });
            });
        });

        it('authorize() rejects a missing email', async () => {
            await jest.isolateModulesAsync(async () => {
                delete process.env.DATABASE_URL;
                process.env.VERCEL_ENV = 'preview';
                const { authOptions } = require('../../../src/auth/authOptions');
                const stub = authOptions.providers.find((p: { id: string; options?: { id?: string } }) => (p.options?.id ?? p.id) === 'preview-stub');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const user = await (stub as any).options.authorize({});
                expect(user).toBeNull();
            });
        });

        it('authorize() rejects even if VERCEL_ENV changed after the provider was built', async () => {
            await jest.isolateModulesAsync(async () => {
                delete process.env.DATABASE_URL;
                process.env.VERCEL_ENV = 'preview';
                const { authOptions } = require('../../../src/auth/authOptions');
                const stub = authOptions.providers.find((p: { id: string; options?: { id?: string } }) => (p.options?.id ?? p.id) === 'preview-stub');
                process.env.VERCEL_ENV = 'production';
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const user = await (stub as any).options.authorize({ email: 'test@example.com' });
                expect(user).toBeNull();
            });
        });
    });

    it('uses the JWT session strategy', async () => {
        await jest.isolateModulesAsync(async () => {
            delete process.env.DATABASE_URL;
            const { authOptions } = require('../../../src/auth/authOptions');
            expect(authOptions.session).toEqual({ strategy: 'jwt' });
        });
    });

    describe('callbacks', () => {
        it('jwt callback copies user.id onto token.sub when a user is present', async () => {
            await jest.isolateModulesAsync(async () => {
                delete process.env.DATABASE_URL;
                const { authOptions } = require('../../../src/auth/authOptions');
                const token = { sub: undefined } as { sub?: string };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (authOptions.callbacks as any).jwt({ token, user: { id: 'user-123' } });
                expect(result.sub).toBe('user-123');
            });
        });

        it('jwt callback leaves token unchanged when no user is present', async () => {
            await jest.isolateModulesAsync(async () => {
                delete process.env.DATABASE_URL;
                const { authOptions } = require('../../../src/auth/authOptions');
                const token = { sub: 'existing-sub' };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (authOptions.callbacks as any).jwt({ token });
                expect(result.sub).toBe('existing-sub');
            });
        });

        it('session callback copies token.sub onto session.user.id', async () => {
            await jest.isolateModulesAsync(async () => {
                delete process.env.DATABASE_URL;
                const { authOptions } = require('../../../src/auth/authOptions');
                const session = { user: { email: 'a@b.com' } } as { user: { email: string; id?: string } };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (authOptions.callbacks as any).session({ session, token: { sub: 'user-123' } });
                expect(result.user.id).toBe('user-123');
            });
        });

        it('session callback is a no-op when there is no session.user', async () => {
            await jest.isolateModulesAsync(async () => {
                delete process.env.DATABASE_URL;
                const { authOptions } = require('../../../src/auth/authOptions');
                const session = {} as { user?: { id?: string } };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (authOptions.callbacks as any).session({ session, token: { sub: 'user-123' } });
                expect(result.user).toBeUndefined();
            });
        });
    });
});
