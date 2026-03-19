/**
 * @jest-environment node
 *
 * Runs in a Node.js environment (window is undefined) so that
 * initializeServerLogger() fires during module load, covering the
 * server-side initialisation paths that are unreachable in the default
 * jsdom environment.
 *
 * All tests use jest.resetModules() + require() to avoid hoisting/TDZ
 * issues with jest.mock() factory closures.
 */

describe('logger — server-side initialisation (node environment)', () => {
  it('window is undefined in this environment', () => {
    expect(typeof window).toBe('undefined');
  });

  describe('with valid winston mock', () => {
    let mockWinstonLog: jest.Mock;
    let mockCreateLogger: jest.Mock;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mod: any;

    beforeEach(() => {
      jest.resetModules();
      mockWinstonLog = jest.fn();
      mockCreateLogger = jest.fn(() => ({ log: mockWinstonLog }));
      jest.doMock('winston', () => ({
        createLogger: mockCreateLogger,
        transports: { Console: jest.fn() },
        format: {
          combine: jest.fn(() => ({})),
          timestamp: jest.fn(() => ({})),
          printf: jest.fn((fn: unknown) => fn),
        },
      }));
      mod = require('../../src/utils/logger');
    });

    afterEach(() => {
      jest.resetModules();
    });

    it('initialises a winston logger when window is undefined', () => {
      expect(mockCreateLogger).toHaveBeenCalled();
    });

    it('delegates log() to the winston logger', () => {
      mod.log('info', 'server log', { x: 1 });
      expect(mockWinstonLog).toHaveBeenCalledWith('info', 'server log', { x: 1 });
    });

    it('logger.info delegates to the winston logger', () => {
      mod.logger.info('hello', { a: 1 });
      expect(mockWinstonLog).toHaveBeenCalledWith('info', 'hello', { a: 1 });
    });

    it('logger.warn delegates to the winston logger', () => {
      mod.logger.warn('careful');
      expect(mockWinstonLog).toHaveBeenCalledWith('warn', 'careful', expect.any(Object));
    });

    it('logger.error delegates to the winston logger', () => {
      mod.logger.error('boom', { err: 'details' });
      expect(mockWinstonLog).toHaveBeenCalledWith('error', 'boom', { err: 'details' });
    });
  });

  it('falls back to browser logger when winston throws during init', () => {
    jest.resetModules();
    jest.doMock('winston', () => {
      throw new Error('winston unavailable');
    });

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const freshMod = require('../../src/utils/logger');
    freshMod.log('info', 'fallback test', { foo: 'bar' });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
    jest.resetModules();
  });

  it('falls back to browser logger when winston.createLogger throws during init', () => {
    jest.resetModules();
    jest.doMock('winston', () => ({
      createLogger: () => { throw new Error('createLogger failed'); },
      transports: { Console: jest.fn() },
      format: { combine: jest.fn(), timestamp: jest.fn(), printf: jest.fn() },
    }));

    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const freshMod = require('../../src/utils/logger');
    freshMod.log('info', 'fallback', {});
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
    jest.resetModules();
  });

  it('uses __TEST_WINSTON__ hook when set on globalThis', () => {
    jest.resetModules();
    const testLog = jest.fn();
    const testCreate = jest.fn(() => ({ log: testLog }));
    (globalThis as unknown as Record<string, unknown>).__TEST_WINSTON__ = {
      createLogger: testCreate,
      transports: { Console: function Console() {} },
      format: {
        combine: () => ({}),
        timestamp: () => ({}),
        printf: (fn: unknown) => fn,
      },
    };

    jest.doMock('winston', () => ({
      createLogger: jest.fn(() => ({ log: jest.fn() })),
      transports: { Console: jest.fn() },
      format: { combine: jest.fn(), timestamp: jest.fn(), printf: jest.fn() },
    }));

    const freshMod = require('../../src/utils/logger');
    freshMod.log('info', 'via test winston', {});
    expect(testCreate).toHaveBeenCalled();
    expect(testLog).toHaveBeenCalledWith('info', 'via test winston', expect.any(Object));

    delete (globalThis as unknown as Record<string, unknown>).__TEST_WINSTON__;
    jest.resetModules();
  });

  it('polyfills setImmediate when it is absent', () => {
    jest.resetModules();
    const origSetImmediate = (globalThis as unknown as Record<string, unknown>).setImmediate;
    delete (globalThis as unknown as Record<string, unknown>).setImmediate;

    jest.doMock('winston', () => ({
      createLogger: jest.fn(() => ({ log: jest.fn() })),
      transports: { Console: jest.fn() },
      format: {
        combine: jest.fn(() => ({})),
        timestamp: jest.fn(() => ({})),
        printf: jest.fn((fn: unknown) => fn),
      },
    }));

    expect(() => require('../../src/utils/logger')).not.toThrow();
    expect(typeof (globalThis as unknown as Record<string, unknown>).setImmediate).toBe('function');

    (globalThis as unknown as Record<string, unknown>).setImmediate = origSetImmediate;
    jest.resetModules();
  });
});
