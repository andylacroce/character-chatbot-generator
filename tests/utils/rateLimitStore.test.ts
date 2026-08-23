const mockLoggerError = jest.fn();
const mockLoggerWarn = jest.fn();
jest.mock('../../src/utils/logger', () => ({
    __esModule: true,
    default: {
        error: (...a: unknown[]) => mockLoggerError(...a),
        warn: (...a: unknown[]) => mockLoggerWarn(...a),
        info: jest.fn(),
    },
}));

import type { Options } from 'express-rate-limit';
import {
    RedisRestStore,
    createRateLimitStore,
    getRedisRestConfig,
    rateLimitLogger,
} from '../../src/utils/rateLimitStore';

const CONFIG = { url: 'https://redis.example', token: 'token' };

/** Queues one pipeline response: an array of `{ result }` entries. */
function redisReturns(...results: unknown[]) {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => results.map((result) => ({ result })),
    });
}

/** The commands sent in the nth pipeline call. */
function commandsSent(callIndex = 0): unknown[][] {
    return JSON.parse((global.fetch as jest.Mock).mock.calls[callIndex][1].body);
}

function newStore(name = 'chat', windowMs = 60_000) {
    const store = new RedisRestStore(CONFIG, name);
    store.init({ windowMs } as Options);
    return store;
}

describe('getRedisRestConfig', () => {
    it('returns null when nothing is configured', () => {
        expect(getRedisRestConfig({})).toBeNull();
    });

    it.each([
        ['only a URL', { KV_REST_API_URL: 'https://redis.example' }],
        ['only a token', { KV_REST_API_TOKEN: 'token' }],
    ])('returns null with %s', (_label, env) => {
        expect(getRedisRestConfig(env)).toBeNull();
    });

    it('reads the Vercel KV variable names', () => {
        expect(
            getRedisRestConfig({
                KV_REST_API_URL: 'https://redis.example',
                KV_REST_API_TOKEN: 'token',
            }),
        ).toEqual(CONFIG);
    });

    it('reads the Upstash variable names', () => {
        expect(
            getRedisRestConfig({
                UPSTASH_REDIS_REST_URL: 'https://redis.example',
                UPSTASH_REDIS_REST_TOKEN: 'token',
            }),
        ).toEqual(CONFIG);
    });

    it('prefers the Vercel KV names when both pairs are present', () => {
        expect(
            getRedisRestConfig({
                KV_REST_API_URL: 'https://kv.example',
                KV_REST_API_TOKEN: 'kv-token',
                UPSTASH_REDIS_REST_URL: 'https://upstash.example',
                UPSTASH_REDIS_REST_TOKEN: 'upstash-token',
            }),
        ).toEqual({ url: 'https://kv.example', token: 'kv-token' });
    });

    it('strips trailing slashes so the pipeline path is well formed', () => {
        expect(
            getRedisRestConfig({
                KV_REST_API_URL: 'https://redis.example//',
                KV_REST_API_TOKEN: 'token',
            }),
        ).toEqual(CONFIG);
    });
});

describe('createRateLimitStore', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        process.env = { ...OLD_ENV };
        delete process.env.KV_REST_API_URL;
        delete process.env.KV_REST_API_TOKEN;
        delete process.env.UPSTASH_REDIS_REST_URL;
        delete process.env.UPSTASH_REDIS_REST_TOKEN;
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('returns undefined so MemoryStore is used locally', () => {
        expect(createRateLimitStore('chat')).toBeUndefined();
    });

    it('returns a Redis store when configured', () => {
        process.env.UPSTASH_REDIS_REST_URL = 'https://redis.example';
        process.env.UPSTASH_REDIS_REST_TOKEN = 'token';

        expect(createRateLimitStore('chat')).toBeInstanceOf(RedisRestStore);
    });
});

describe('RedisRestStore', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch = jest.fn();
    });

    it('reports that counters are shared across instances', () => {
        // This is the whole point of the store: express-rate-limit must not treat
        // the counters as instance-local.
        expect(newStore().localKeys).toBe(false);
    });

    describe('increment', () => {
        it('opens the window, counts the hit and reports the reset time', async () => {
            redisReturns('OK', 1, 60_000);
            const before = Date.now();

            const result = await newStore().increment('1.2.3.4');

            expect(commandsSent()).toEqual([
                ['SET', 'rl:chat:1.2.3.4', '0', 'PX', 60_000, 'NX'],
                ['INCR', 'rl:chat:1.2.3.4'],
                ['PTTL', 'rl:chat:1.2.3.4'],
            ]);
            expect(result.totalHits).toBe(1);
            expect(result.resetTime!.getTime()).toBeGreaterThanOrEqual(before + 59_000);
        });

        it('posts to the pipeline endpoint with the bearer token', async () => {
            redisReturns('OK', 1, 60_000);
            await newStore().increment('1.2.3.4');

            const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
            expect(url).toBe('https://redis.example/pipeline');
            expect(init.method).toBe('POST');
            expect(init.headers.Authorization).toBe('Bearer token');
        });

        it('does not re-arm the expiry on later hits in the same window', async () => {
            // SET ... NX is a no-op once the key exists, so the window stays anchored
            // to the first request rather than sliding forward with each one.
            redisReturns(null, 7, 12_000);

            const result = await newStore().increment('1.2.3.4');

            expect(result.totalHits).toBe(7);
            expect(result.resetTime!.getTime()).toBeLessThanOrEqual(Date.now() + 12_000);
        });

        it('re-arms a key that lost its expiry', async () => {
            redisReturns(null, 4, -1);
            redisReturns(1);

            const result = await newStore('chat', 30_000).increment('1.2.3.4');

            expect(commandsSent(1)).toEqual([['PEXPIRE', 'rl:chat:1.2.3.4', 30_000]]);
            expect(result.totalHits).toBe(4);
        });

        it('namespaces keys by limiter name', async () => {
            redisReturns('OK', 1, 60_000);
            await newStore('audio').increment('1.2.3.4');

            expect(commandsSent()[1]).toEqual(['INCR', 'rl:audio:1.2.3.4']);
        });

        it('uses the window the middleware was configured with', async () => {
            redisReturns('OK', 1, 5_000);
            await newStore('chat', 5_000).increment('1.2.3.4');

            expect(commandsSent()[0]).toContain(5_000);
        });

        it('throws on an HTTP error so the limiter can fail open', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 503 });

            await expect(newStore().increment('1.2.3.4')).rejects.toThrow(
                'Rate limit store responded 503',
            );
        });

        it('throws when a command in the pipeline reports an error', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => [{ result: 'OK' }, { error: 'WRONGTYPE' }],
            });

            await expect(newStore().increment('1.2.3.4')).rejects.toThrow(
                'Rate limit store command failed: WRONGTYPE',
            );
        });

        it('throws when the response is not a pipeline array', async () => {
            (global.fetch as jest.Mock).mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ result: 'nope' }),
            });

            await expect(newStore().increment('1.2.3.4')).rejects.toThrow(/malformed pipeline/);
        });

        it('throws when the hit count is not a number', async () => {
            redisReturns('OK', 'not-a-number', 60_000);

            await expect(newStore().increment('1.2.3.4')).rejects.toThrow(/non-numeric hit count/);
        });

        it('propagates a transport failure', async () => {
            (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));

            await expect(newStore().increment('1.2.3.4')).rejects.toThrow('network down');
        });
    });

    it('decrements a namespaced key', async () => {
        redisReturns(0);
        await newStore().decrement('1.2.3.4');

        expect(commandsSent()).toEqual([['DECR', 'rl:chat:1.2.3.4']]);
    });

    it('resets a namespaced key', async () => {
        redisReturns(1);
        await newStore().resetKey('1.2.3.4');

        expect(commandsSent()).toEqual([['DEL', 'rl:chat:1.2.3.4']]);
    });

    it('defaults the window before init runs', async () => {
        redisReturns('OK', 1, 60_000);
        await new RedisRestStore(CONFIG, 'chat').increment('1.2.3.4');

        expect(commandsSent()[0]).toContain(60_000);
    });
});

describe('rateLimitLogger', () => {
    beforeEach(() => jest.clearAllMocks());

    it('routes store errors into the app logger', () => {
        rateLimitLogger.error(new Error('boom'), 'store failed');

        expect(mockLoggerError).toHaveBeenCalledWith('store failed', { error: 'Error: boom' });
    });

    it('routes store warnings into the app logger', () => {
        rateLimitLogger.warn('heads up');

        expect(mockLoggerWarn).toHaveBeenCalledWith('Rate limit store warning', { error: 'heads up' });
    });

    it('supplies a default message when none is given', () => {
        rateLimitLogger.error('bare');

        expect(mockLoggerError).toHaveBeenCalledWith('Rate limit store error', { error: 'bare' });
    });
});
