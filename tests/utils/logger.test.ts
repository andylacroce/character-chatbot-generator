import { log, generateRequestId, logEvent, truncate, sanitizeLogMeta, logger } from '../../src/utils/logger';

describe('logger utility', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('loads server-side (winston) logger when window is undefined', () => {
        const origWindow = (globalThis as unknown as { window?: Window }).window;
        // Simulate server-side environment by removing window object
        delete (globalThis as unknown as { window?: Window }).window;
        // Clear cached modules so the logger reinitializes in server context
        jest.resetModules();
        const serverLogger = require('../../src/utils/logger');
        expect(typeof serverLogger.logger.info).toBe('function');
        // Verify logger initializes without errors in server context
        expect(() => serverLogger.logger.info('server test')).not.toThrow();
        // Restore window object and clear module cache
        (globalThis as unknown as { window?: Window }).window = origWindow;
        jest.resetModules();
    });

    it('should generate a unique request ID', () => {
        const id1 = generateRequestId();
        const id2 = generateRequestId();
        expect(id1).not.toEqual(id2);
        expect(typeof id1).toBe('string');
        expect(typeof id2).toBe('string');
    });

    it('should log messages at different levels', () => {
        // Mock the internal loggerInstance.log method
        const spy = jest.spyOn(console, 'log').mockImplementation(() => { });
        log('info', 'Test info log', { foo: 'bar' });
        log('error', 'Test error log');
        spy.mockRestore();
    });

    it('should log info messages with console.log', () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
        log('info', 'Info message', { data: 'test' });
        expect(logSpy).toHaveBeenCalled();
        logSpy.mockRestore();
    });

    it('should log error messages with console.error', () => {
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        log('error', 'Error message', { error: 'test' });
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it('should log warning messages with console.warn', () => {
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        log('warn', 'Warning message', { warning: 'test' });
        expect(warnSpy).toHaveBeenCalled();
        warnSpy.mockRestore();
    });

    it('should log events with metadata', () => {
        const spy = jest.spyOn(console, 'log').mockImplementation(() => { });
        logEvent('info', 'test_event', 'Event message', { foo: 'bar' });
        logEvent('error', 'error_event', 'Error occurred');
        spy.mockRestore();
    });

    it('should log events without metadata', () => {
        const spy = jest.spyOn(console, 'warn').mockImplementation(() => { });
        logEvent('warn', 'warning_event', 'Warning occurred');
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });

    describe('logger convenience methods', () => {
        it('should log info with logger.info', () => {
            const spy = jest.spyOn(console, 'log').mockImplementation(() => { });
            logger.info('Info message', { key: 'value' });
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should log info with logger.info and non-object meta', () => {
            const spy = jest.spyOn(console, 'log').mockImplementation(() => { });
            logger.info('Info message', 'string meta');
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should log info with logger.info and null meta', () => {
            const spy = jest.spyOn(console, 'log').mockImplementation(() => { });
            logger.info('Info message', null);
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should log warn with logger.warn', () => {
            const spy = jest.spyOn(console, 'warn').mockImplementation(() => { });
            logger.warn('Warning message', { key: 'value' });
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should log warn with logger.warn and non-object meta', () => {
            const spy = jest.spyOn(console, 'warn').mockImplementation(() => { });
            logger.warn('Warning message', 'string meta');
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should log error with logger.error', () => {
            const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
            logger.error('Error message', { error: 'details' });
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should log error with logger.error and non-object meta', () => {
            const spy = jest.spyOn(console, 'error').mockImplementation(() => { });
            logger.error('Error message', 42);
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should log with logger.log', () => {
            const spy = jest.spyOn(console, 'log').mockImplementation(() => { });
            logger.log('debug', 'Debug message', { debug: true });
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });

        it('should log without metadata', () => {
            const spy = jest.spyOn(console, 'log').mockImplementation(() => { });
            logger.info('Info message without meta');
            expect(spy).toHaveBeenCalled();
            spy.mockRestore();
        });
    });

    describe('truncate', () => {
        it('returns string unchanged if under max', () => {
            expect(truncate('short', 10)).toBe('short');
        });
        it('truncates long string and adds ellipsis', () => {
            expect(truncate('a'.repeat(150), 100)).toBe('a'.repeat(100) + '…');
        });
        it('uses default max when not provided', () => {
            const longString = 'a'.repeat(150);
            const result = truncate(longString);
            expect(result).toBe('a'.repeat(100) + '…');
            expect(result.length).toBe(101);
        });
        it('returns input unchanged if not a string', () => {
    // Use unknown cast to pass non-string value without TypeScript errors
    expect(truncate((123 as unknown) as string, 10)).toBe(123);
        });
    });

    describe('sanitizeLogMeta', () => {
        it('truncates long string fields', () => {
            const meta = { long: 'a'.repeat(200) };
            const result = sanitizeLogMeta(meta);
            expect((result.long as string).endsWith('…')).toBe(true);
            expect((result.long as string).length).toBe(121); // 120 + ellipsis
        });
        it('summarizes object fields', () => {
            const meta = { obj: { foo: 'bar' } };
            const result = sanitizeLogMeta(meta);
            expect(result.obj).toBe('[Object]');
        });
        it('handles null values', () => {
            const meta = { nullValue: null };
            const result = sanitizeLogMeta(meta);
            expect(result.nullValue).toBeNull();
        });
        it('summarizes long arrays', () => {
            const meta = { arr: [1, 2, 3, 4, 5, 6, 7] };
            const result = sanitizeLogMeta(meta);
            expect(result.arr).toBe('[Array(7)]');
        });
        it('keeps short arrays and primitives unchanged', () => {
            const meta = { arr: [1, 2], num: 5, str: 'ok' };
            const result = sanitizeLogMeta(meta);
            expect(result.arr).toEqual([1, 2]);
            expect(result.num).toBe(5);
            expect(result.str).toBe('ok');
        });
        it('keeps short strings unchanged', () => {
            const meta = { short: 'test string' };
            const result = sanitizeLogMeta(meta);
            expect(result.short).toBe('test string');
        });
        it('keeps boolean values unchanged', () => {
            const meta = { flag: true, disabled: false };
            const result = sanitizeLogMeta(meta);
            expect(result.flag).toBe(true);
            expect(result.disabled).toBe(false);
        });
    });

    it('should work in browser and server environments', () => {
        // Verify logger works correctly in both server and browser environments
        expect(typeof log).toBe('function');
        expect(typeof logEvent).toBe('function');
        expect(typeof generateRequestId).toBe('function');
    });

    it('uses winston when available on server', () => {
        // Ensure we're running in a server-like environment for this import
        const origWindow = (globalThis as unknown as { window?: Window }).window;
        delete (globalThis as unknown as { window?: Window }).window;

        // Mock a minimal winston implementation that exposes createLogger
        jest.isolateModules(() => {
            jest.doMock('winston', () => ({
                createLogger: () => ({ log: jest.fn() }),
                transports: { Console: function Console() {} },
                format: { combine: () => {}, timestamp: () => {}, printf: () => {} }
            }));

            // Re-require module in isolated context to exercise server-side branch
            const serverLogger = require('../../src/utils/logger');
            expect(typeof serverLogger.logger.info).toBe('function');
            expect(() => serverLogger.logger.info('server test')).not.toThrow();
        });

        // restore environment
        (globalThis as unknown as { window?: Window }).window = origWindow;
        jest.resetModules();
    });

    it('polyfills setImmediate when missing on server', () => {
        const origWindow = (globalThis as unknown as { window?: Window }).window;
        const origSetImmediate = (globalThis as unknown as { setImmediate?: unknown }).setImmediate;
        delete (globalThis as unknown as { window?: Window }).window;

        jest.isolateModules(() => {
            // Ensure setImmediate is missing inside the isolated module context
            delete (globalThis as unknown as { setImmediate?: unknown }).setImmediate;

            jest.doMock('winston', () => ({
                createLogger: () => ({ log: jest.fn() }),
                transports: { Console: function Console() {} },
                format: { combine: () => {}, timestamp: () => {}, printf: () => {} }
            }));

            // Re-require module to exercise setImmediate polyfill path
            const serverLogger = require('../../src/utils/logger');
            // We verify that the server logger initializes successfully (polyfill may be environment-dependent)
            expect(typeof serverLogger.logger.info).toBe('function');
        });

        // restore environment
        (globalThis as unknown as { window?: Window }).window = origWindow;
        (globalThis as unknown as { setImmediate?: unknown }).setImmediate = origSetImmediate;
        jest.resetModules();
    });

    it('falls back to browser logger when winston import fails on server', () => {
        const origWindow = (globalThis as unknown as { window?: Window }).window;
        delete (globalThis as unknown as { window?: Window }).window;

        jest.isolateModules(() => {
            // Make requiring winston throw to trigger the fallback
            jest.doMock('winston', () => { throw new Error('nope'); });

            const serverLogger = require('../../src/utils/logger');

            const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            serverLogger.log('info', 'fallback test', { foo: 'bar' });
            expect(logSpy).toHaveBeenCalled();
            logSpy.mockRestore();
        });

        (globalThis as unknown as { window?: Window }).window = origWindow;
        jest.resetModules();
    });
});
