describe('logger server-side initialization', () => {
  it('falls back to winston when window undefined and winston available', () => {
    // Reset module cache and simulate server environment
    const originalWindow = (global as unknown as { window?: Window }).window;
    delete (global as unknown as { window?: Window }).window;

    // Force server logger init via env override and mock winston
    const createLoggerMock = jest.fn(() => ({ log: jest.fn() }));
    const ConsoleMock = jest.fn();
    const formatMock = { combine: jest.fn(), timestamp: jest.fn(), printf: jest.fn(() => (_info: unknown) => '') };
    // For environments where `require` may not be available to the source (bundled ESM/Jest setups),
    // provide a test-only global that the logger module will prefer when FORCE_SERVER_LOGGER is set.
    const g = global as unknown as Record<string, unknown>;
    (g as Record<string, unknown>).__TEST_WINSTON__ = { createLogger: createLoggerMock, transports: { Console: ConsoleMock }, format: formatMock };

    // Set env var and reset modules to ensure server path is taken
    (process.env as Record<string,string>).FORCE_SERVER_LOGGER = '1';
    jest.resetModules();

    // Require the module fresh
    // dynamic import for test (no lint suppression required here)
    const logger = require('../../../src/utils/logger');

    // Calling log should delegate to the Winston-backed logger instance
    logger.log('info', 'server test', { foo: 'bar' });
    expect(createLoggerMock).toHaveBeenCalled();

    // Cleanup mocks and restore env and window
    delete (process.env as Record<string,string>).FORCE_SERVER_LOGGER;
    jest.dontMock('winston');
    (global as unknown as { window?: Window }).window = originalWindow;
    jest.resetModules();
  });
});
