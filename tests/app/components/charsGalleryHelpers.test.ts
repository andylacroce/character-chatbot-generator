import {
  hashString,
  rotationDeg,
  supportsViewTransitions,
  withViewTransition,
} from "../../../src/app/components/character/charsGalleryHelpers";

describe("hashString", () => {
  it("is deterministic and non-negative", () => {
    expect(hashString("Cleopatra")).toBe(hashString("Cleopatra"));
    expect(hashString("Cleopatra")).toBeGreaterThanOrEqual(0);
  });

  it("differs between names", () => {
    expect(hashString("Cleopatra")).not.toBe(hashString("Napoleon"));
  });
});

describe("rotationDeg", () => {
  it("stays within -2.5..2.5 degrees and is stable per name", () => {
    for (const name of ["Ada", "Zeus", "Sherlock Holmes", "Joan of Arc"]) {
      const deg = rotationDeg(name);
      expect(deg).toBeGreaterThanOrEqual(-2.5);
      expect(deg).toBeLessThanOrEqual(2.5);
      expect(rotationDeg(name)).toBe(deg);
    }
  });
});

describe("withViewTransition", () => {
  afterEach(() => {
    delete (document as unknown as Record<string, unknown>).startViewTransition;
  });

  it("runs the change directly when View Transitions are unsupported", () => {
    const change = jest.fn();
    expect(supportsViewTransitions()).toBe(false);
    withViewTransition(change);
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("hands the change to startViewTransition when supported", () => {
    const start = jest.fn((cb: () => void) => cb());
    (document as unknown as Record<string, unknown>).startViewTransition = start;
    const change = jest.fn();
    expect(supportsViewTransitions()).toBe(true);
    withViewTransition(change);
    expect(start).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledTimes(1);
  });
});
