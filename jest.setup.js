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
