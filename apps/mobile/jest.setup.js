// api.ts throws at import time if this is unset — every test file transitively imports it.
process.env.EXPO_PUBLIC_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL || "https://test.example.com";
process.env.EXPO_PUBLIC_API_SECRET = process.env.EXPO_PUBLIC_API_SECRET || "test-secret";

// async-storage's own in-memory mock. Pinned to 2.x, the version Expo SDK 57's Expo Go
// ships natively (3.x's JS needs a native module Expo Go doesn't have).
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// expo-secure-store has no official jest mock — back it with a simple in-memory map so
// authToken.ts's get/set/delete round-trip like it would on-device.
jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn((key) => Promise.resolve(store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn((key, value) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: jest.fn(() => Promise.resolve({ type: "cancel" })),
}));

jest.mock("expo-linking", () => ({
  createURL: jest.fn((path) => `character-chatbot-mobile://${path}`),
  parse: jest.fn((url) => ({ queryParams: {} })),
}));

// expo-audio's hooks aren't native-module-backed the way plain expo-* modules are (they're
// exported directly from the JS entrypoint), so jest-expo's automatic native mocking doesn't
// reach them — stub the pieces ChatScreen actually calls.
jest.mock("expo-audio", () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: jest.fn(() => ({
    play: jest.fn(),
    pause: jest.fn(),
    replace: jest.fn(),
    seekTo: jest.fn(),
  })),
  useAudioPlayerStatus: jest.fn(() => ({
    playing: false,
    didJustFinish: false,
    currentTime: 0,
    duration: 0,
  })),
}));

// Individual tests override this per-call; a safe default avoids "fetch is not a function"
// for any test that doesn't care about the network call it triggers.
// @expo/vector-icons' createIconSet does an async, module-scoped, one-time font-loading
// check that calls setState outside of any act() scope once it resolves — observed to fire
// well after the test that first rendered an icon has already finished, landing squarely in
// the middle of a LATER test's own render and corrupting it (an empty committed tree, a
// dropped mount effect). Replacing every icon family with a plain Text stand-in removes that
// async check entirely; icons aren't asserted on by name in these tests, only by what they're
// inside (an accessibilityLabel, a button's other text), so this is a safe substitute.
jest.mock("@expo/vector-icons", () => {
  const ReactActual = require("react");
  const { Text } = require("react-native");
  const iconFamily = new Proxy(
    {},
    {
      get: (_target, iconName) =>
        function MockIcon(props) {
          return ReactActual.createElement(Text, props, `icon:${String(iconName)}`);
        },
    },
  );
  return iconFamily;
});

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    statusText: "OK",
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(""),
  }),
);

afterEach(() => {
  jest.clearAllMocks();
});
