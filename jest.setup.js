// Polyfill clearImmediate for Node.js (needed for undici/Vercel Blob SDK in Jest)
if (typeof global.clearImmediate === "undefined") {
  global.clearImmediate = function (fn, ...args) {
    return setImmediate(fn, ...args);
  };
}

// Polyfill TextEncoder for Node.js before any other imports
if (typeof global.TextEncoder === "undefined") {
  const { TextEncoder } = require("util");
  global.TextEncoder = TextEncoder;
}

// Polyfill TextDecoder for Node.js before any other imports
if (typeof global.TextDecoder === "undefined") {
  const { TextDecoder } = require("util");
  global.TextDecoder = TextDecoder;
}

import "@testing-library/jest-dom";

// Mock HTMLMediaElement methods
Object.defineProperty(global.HTMLMediaElement.prototype, "play", {
  configurable: true,
  value: jest.fn().mockImplementation(() => Promise.resolve()),
});

Object.defineProperty(global.HTMLMediaElement.prototype, "pause", {
  configurable: true,
  value: jest.fn(),
});

// Suppress React warnings about deprecated lifecycle methods during tests
const originalWarn = console.warn;
console.warn = (...args) => {
  if (
    args[0] &&
    args[0].includes("componentWillReceiveProps has been renamed")
  ) {
    return;
  }
  originalWarn(...args);
};

// Polyfill performance.markResourceTiming for undici in Jest/jsdom
global.performance = global.performance || {};
global.performance.markResourceTiming = global.performance.markResourceTiming || (() => { });

// Mock ResizeObserver for libraries that rely on it (react-window hooks)
class MockResizeObserver {
  observe() { }
  unobserve() { }
  disconnect() { }
}
global.ResizeObserver = global.ResizeObserver || MockResizeObserver;

// Mock global fetch to prevent undici TCPWRAP handle leaks in tests
if (typeof global.fetch === 'undefined') {
  global.fetch = async () => ({ ok: true, status: 200, json: async () => ({}) });
}

// Ensure all timers and mocks are cleaned up after each test to prevent open handles
afterEach(() => {
  jest.clearAllTimers();
  jest.restoreAllMocks();
  jest.useRealTimers(); // Ensure no fake timers leak between tests
});

// Protect test process by removing any existing unhandled rejection listeners
// (Next may install an instrumentation listener that can throw during test
// execution and cause the process to crash). Install a safe fallback now so
// it is present for the entire test run.
try {
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('unhandledRejection (test-protected):', reason && reason.stack ? reason.stack : reason);
  });
} catch (e) {
  // ignore in test environment
}

// Clean up undici's global dispatcher to close open TCP handles after all tests
// try {
//   const { globalDispatcher } = require("undici");
//   afterAll(() => {
//     if (
//       globalDispatcher &&
//       typeof globalDispatcher.destroy === "function"
//     ) {
//       globalDispatcher.destroy();
//     }
//   });
// } catch (e) {
//   // undici not used, ignore
// }

// Prevent Next's unhandled-rejection instrumentation from crashing the Jest process.
// Some Next internals install a listener that can throw during teardown; remove
// any listeners after tests and replace with a safe logger to avoid uncatchable
// rethrows that kill the test runner.
// Keep the afterAll for defensive cleanup in case more listeners are added
// during tests (this will re-assert our safe handler at teardown).
afterAll(() => {
  try {
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', (reason) => {
      // eslint-disable-next-line no-console
      console.error('unhandledRejection (test-protected):', reason && reason.stack ? reason.stack : reason);
    });
  } catch (e) {
    // ignore in test environment
  }
});
