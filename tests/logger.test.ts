import { log, generateRequestId } from '../src/utils/logger';

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
