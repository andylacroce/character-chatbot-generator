// Manual Jest mock for the 'uuid' package.
//
// Why: `uuid@13` is published as an ESM package (uses `export`) which Jest won't parse
// unless it's transformed. To keep test configuration simple and deterministic we
// provide a small CommonJS-compatible mock. This avoids having to change global
// Babel settings or adding complex per-package transforms.
//
// Notes and alternatives:
// - This mock returns deterministic, unique-like UUID strings for test stability.
// - If you prefer to remove the mock, configure Babel/Jest to transform `uuid` in
//   `transformIgnorePatterns` (we already whitelist it), or pin to a CommonJS uuid
//   release, or use `moduleNameMapper` in Jest to redirect to a helper module.
// - Keep the mock under __mocks__ so Jest picks it up automatically for tests.

let counter = 0;
module.exports = {
  v4: () => {
    counter += 1;
    // produce a deterministic but unique UUID-like string for tests
    const hex = counter.toString(16).padStart(12, '0');
    return `00000000-0000-4000-8000-${hex}`;
  },
};
