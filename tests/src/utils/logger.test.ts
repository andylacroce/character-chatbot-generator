import * as loggerModule from '../../../src/utils/logger';

describe('logger utilities', () => {
  it('truncate returns non-strings unchanged', () => {
    expect(loggerModule.truncate(undefined as unknown as string)).toBeUndefined();
  });

  it('truncate short strings unchanged and long strings truncated', () => {
    const short = 'hello';
    expect(loggerModule.truncate(short, 10)).toBe(short);
    const long = 'a'.repeat(200);
    const truncated = loggerModule.truncate(long, 50);
    expect(truncated.length).toBe(51); // 50 chars + ellipsis
  });

  it('sanitizeLogMeta truncates long strings, summarizes objects and arrays', () => {
    const meta: Record<string, unknown> = {
      short: 'ok',
      long: 'x'.repeat(200),
      obj: { a: 1, b: 2 },
      arr: [1,2,3,4,5,6,7]
    };
    const result = loggerModule.sanitizeLogMeta(meta);
    expect(result.short).toBe('ok');
    expect(typeof result.long === 'string').toBe(true);
    expect((result.obj as string)).toBe('[Object]');
    expect((result.arr as string)).toBe('[Array(7)]');
  });

  it('logEvent and logger methods call console methods appropriately', () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    loggerModule.logEvent('info', 'ev', 'message', { foo: 'bar' });
    expect(logSpy).toHaveBeenCalled();

    loggerModule.logEvent('info', 'ev2', 'info message', { foo: 'bar' });
    expect(logSpy).toHaveBeenCalled();

    loggerModule.logger.warn('warn msg', { extra: 'context' });
    expect(warnSpy).toHaveBeenCalled();

    loggerModule.logger.error('err msg', { err: 'boom' });
    expect(errorSpy).toHaveBeenCalled();

    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('generateRequestId returns a non-empty string', () => {
    const id = loggerModule.generateRequestId();
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });
});
