import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { BackLink, LegalBackLink } from "../../../src/app/components/BackLink";
import {
  __resetClientNavigationStateForTest,
  markClientNavigation,
} from "../../../src/utils/clientNavigationState";

const mockBack = jest.fn();
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

describe.each([
  ["BackLink", BackLink, "Back"],
  ["LegalBackLink", LegalBackLink, /Back/],
])("%s", (_name, Component, label) => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetClientNavigationStateForTest();
  });

  it("goes home when this tab has no in-app history", () => {
    render(<Component />);
    fireEvent.click(screen.getByRole("link", { name: label }));
    expect(mockPush).toHaveBeenCalledWith("/");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("goes back after an in-app navigation", () => {
    markClientNavigation();
    render(<Component />);
    fireEvent.click(screen.getByRole("link", { name: label }));
    expect(mockBack).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
