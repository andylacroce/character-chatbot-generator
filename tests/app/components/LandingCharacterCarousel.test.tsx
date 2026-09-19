import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import LandingCharacterCarousel from "../../../app/components/LandingCharacterCarousel";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

describe("LandingCharacterCarousel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("reserves the carousel space while loading and when the list is empty", async () => {
    mockAuthenticatedFetch.mockResolvedValue({ json: async () => ({ characters: [] }) });
    const { container } = render(<LandingCharacterCarousel />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("img")).toBeNull();
    await act(async () => {});
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith("/api/chars?limit=100&sample=20");
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps the reserved space when the fetch fails", async () => {
    mockAuthenticatedFetch.mockRejectedValue(new Error("network down"));
    const { container } = render(<LandingCharacterCarousel />);
    await act(async () => {});
    expect(mockAuthenticatedFetch).toHaveBeenCalled();
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("shows the first character and navigates to its chat on click", async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      json: async () => ({
        characters: [
          { name: "Sherlock Holmes", avatarUrl: "/a.png" },
          { name: "Cleopatra", avatarUrl: "/b.png" },
        ],
      }),
    });
    render(<LandingCharacterCarousel />);

    expect(await screen.findByLabelText("Chat with Sherlock Holmes")).toBeInTheDocument();
    expect(screen.getByAltText("Sherlock Holmes")).toHaveAttribute("loading", "eager");
    fireEvent.click(screen.getByLabelText("Chat with Sherlock Holmes"));
    expect(mockPush).toHaveBeenCalledWith("/?name=Sherlock%20Holmes");
  });

  it("auto-advances to the next character after the rotation interval", async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      json: async () => ({
        characters: [
          { name: "Sherlock Holmes", avatarUrl: "/a.png" },
          { name: "Cleopatra", avatarUrl: "/b.png" },
        ],
      }),
    });
    render(<LandingCharacterCarousel />);
    await screen.findByLabelText("Chat with Sherlock Holmes");

    act(() => jest.advanceTimersByTime(4000));

    expect(await screen.findByLabelText("Chat with Cleopatra")).toBeInTheDocument();
  });

  it("pauses auto-advance while hovered", async () => {
    mockAuthenticatedFetch.mockResolvedValue({
      json: async () => ({
        characters: [
          { name: "Sherlock Holmes", avatarUrl: "/a.png" },
          { name: "Cleopatra", avatarUrl: "/b.png" },
        ],
      }),
    });
    render(<LandingCharacterCarousel />);
    const button = await screen.findByLabelText("Chat with Sherlock Holmes");

    fireEvent.mouseEnter(button);
    act(() => jest.advanceTimersByTime(6000));
    expect(screen.getByLabelText("Chat with Sherlock Holmes")).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    act(() => jest.advanceTimersByTime(4000));
    expect(await screen.findByLabelText("Chat with Cleopatra")).toBeInTheDocument();
  });
});
