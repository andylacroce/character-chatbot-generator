/**
 * Builds a fetch-Response-shaped object for `authenticatedFetch` mocks in
 * tests — independently reinvented (near-identically) across several test
 * files before being centralized here. Safe to import normally: it's called
 * from inside `.mockImplementation()`/test bodies, never referenced inside a
 * `jest.mock()` factory itself, so it isn't subject to Jest's factory
 * hoisting restrictions on out-of-scope variables.
 */
export function mockResponse(data: unknown, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(typeof data === "string" ? data : JSON.stringify(data)),
    };
}
