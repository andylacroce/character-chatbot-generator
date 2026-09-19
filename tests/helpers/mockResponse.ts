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

/**
 * Builds a fetch-Response-shaped object whose body is a `text/event-stream` of
 * `data: {...}\n\n` frames — for testing code (e.g. useGameController.ts's
 * fetchRoundWithProgress) that reads a streamed response via
 * `response.body.getReader()` instead of `.json()`. All `frames` are queued upfront;
 * use `mockControlledSseResponse` instead when a test needs to inspect state between
 * individual frames as they arrive.
 */
export function mockSseResponse(frames: Record<string, unknown>[], status = 200) {
  const encoder = new TextEncoder();
  const chunks = frames.map((frame) => encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
  let index = 0;
  return {
    ok: status >= 200 && status < 300,
    status,
    body: {
      getReader: () => ({
        read: async () => {
          if (index < chunks.length) {
            const value = chunks[index];
            index += 1;
            return { done: false, value };
          }
          return { done: true, value: undefined };
        },
      }),
    },
  };
}

/**
 * Like mockSseResponse, but frames are fed in one at a time via the returned `push`,
 * and the underlying reader's `read()` doesn't resolve until a frame is pushed (or
 * `finish()` ends the stream) — for tests that need to assert on state between
 * individual real-time SSE events, e.g. a staged-progress label updating as each
 * server-reported stage completes.
 */
export function mockControlledSseResponse() {
  const encoder = new TextEncoder();
  const queue: Uint8Array[] = [];
  let finished = false;
  let waiter: (() => void) | null = null;

  const wake = () => {
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve();
    }
  };

  return {
    response: {
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          read: async () => {
            while (queue.length === 0 && !finished) {
              await new Promise<void>((resolve) => {
                waiter = resolve;
              });
            }
            if (queue.length > 0) {
              return { done: false, value: queue.shift() as Uint8Array };
            }
            return { done: true, value: undefined };
          },
        }),
      },
    },
    push(frame: Record<string, unknown>) {
      queue.push(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      wake();
    },
    finish() {
      finished = true;
      wake();
    },
  };
}
