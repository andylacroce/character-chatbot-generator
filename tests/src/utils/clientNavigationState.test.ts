import {
  hasNavigatedWithinSession,
  markClientNavigation,
  __resetClientNavigationStateForTest,
} from "../../../src/utils/clientNavigationState";

describe("clientNavigationState", () => {
  beforeEach(() => {
    __resetClientNavigationStateForTest();
  });

  it("starts false until a client-side navigation is marked", () => {
    expect(hasNavigatedWithinSession()).toBe(false);
    markClientNavigation();
    expect(hasNavigatedWithinSession()).toBe(true);
  });
});
