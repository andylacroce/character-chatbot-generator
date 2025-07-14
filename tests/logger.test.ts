import { log, generateRequestId, logEvent, truncate, sanitizeLogMeta } from '../src/utils/logger';

describe('logger utility', () => {
    it('should generate a unique request ID', () => {
        const id1 = generateRequestId();
        const id2 = generateRequestId();
        expect(id1).not.toEqual(id2);
        expect(typeof id1).toBe('string');
        expect(typeof id2).toBe('string');
    });

    it('should log messages at different levels', () => {
        // Mock loggerInstance.log
        const spy = jest.spyOn(console, 'log').mockImplementation(() => { });
        log('info', 'Test info log', { foo: 'bar' });
        log('error', 'Test error log');
        spy.mockRestore();
    });

    it('should log events with metadata', () => {
        const spy = jest.spyOn(console, 'log').mockImplementation(() => { });
        logEvent('info', 'test_event', 'Event message', { foo: 'bar' });
        logEvent('error', 'error_event', 'Error occurred');
        spy.mockRestore();
    });

    describe('truncate', () => {
        it('returns string unchanged if under max', () => {
            expect(truncate('short', 10)).toBe('short');
        });
        it('truncates long string and adds ellipsis', () => {
            expect(truncate('a'.repeat(150), 100)).toBe('a'.repeat(100) + '…');
        });
        it('returns input unchanged if not a string', () => {
            expect(truncate(123 as any, 10)).toBe(123);
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
    });

    it('should polyfill setImmediate if missing', () => {
        const original = globalThis.setImmediate;
        // Remove setImmediate
        // @ts-ignore
        delete globalThis.setImmediate;
        jest.resetModules();
        require('../src/utils/logger');
        expect(typeof globalThis.setImmediate).toBe('function');
        // Restore
        globalThis.setImmediate = original;
    });
});
