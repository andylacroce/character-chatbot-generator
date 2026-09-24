import React from "react";
import { render } from "@testing-library/react";
import Providers from "@/src/app/components/Providers";
import {
  hasNavigatedWithinSession,
  __resetClientNavigationStateForTest,
} from "@/src/utils/clientNavigationState";

let mockPathname = "/";
jest.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

jest.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("Providers client-navigation tracking", () => {
  beforeEach(() => {
    mockPathname = "/";
    __resetClientNavigationStateForTest();
  });

  it("does not mark navigation on initial mount", () => {
    render(
      <Providers>
        <div />
      </Providers>,
    );
    expect(hasNavigatedWithinSession()).toBe(false);
  });

  it("marks navigation once the pathname changes after mount", () => {
    const { rerender } = render(
      <Providers>
        <div />
      </Providers>,
    );
    expect(hasNavigatedWithinSession()).toBe(false);

    mockPathname = "/chars";
    rerender(
      <Providers>
        <div />
      </Providers>,
    );
    expect(hasNavigatedWithinSession()).toBe(true);
  });
});
