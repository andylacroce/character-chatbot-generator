import React from "react";
import { act, render, screen, fireEvent } from "@testing-library/react";
import LandingCharacterCarousel from "../../../src/app/components/LandingCharacterCarousel";
import { STORAGE_KEYS } from "character-chatbot-shared";

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

/** A promise the test can resolve on its own schedule, to assert on pre-fetch render state. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe("LandingCharacterCarousel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // This component now caches its last-fetched sample in localStorage — clear it so
    // one test's cache write can never leak into another test's assertions.
    localStorage.clear();
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

  it("paints last visit's cached sample immediately, before the fetch resolves", async () => {
    localStorage.setItem(
      STORAGE_KEYS.landingCarouselCache,
      JSON.stringify({ characters: [{ name: "Cached Hero", avatarUrl: "/cached.png" }] }),
    );
    const { promise, resolve } = deferred<{ json: () => Promise<unknown> }>();
    mockAuthenticatedFetch.mockReturnValue(promise);

    render(<LandingCharacterCarousel />);

    // Still awaiting the fetch, yet the cached portrait is already showing.
    expect(await screen.findByLabelText("Chat with Cached Hero")).toBeInTheDocument();

    await act(async () => {
      resolve({ json: async () => ({ characters: [] }) });
    });
  });

  it("replaces the cached sample once a fresh, non-empty fetch resolves", async () => {
    localStorage.setItem(
      STORAGE_KEYS.landingCarouselCache,
      JSON.stringify({ characters: [{ name: "Cached Hero", avatarUrl: "/cached.png" }] }),
    );
    mockAuthenticatedFetch.mockResolvedValue({
      json: async () => ({ characters: [{ name: "Fresh Hero", avatarUrl: "/fresh.png" }] }),
    });

    render(<LandingCharacterCarousel />);

    expect(await screen.findByLabelText("Chat with Fresh Hero")).toBeInTheDocument();
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEYS.landingCarouselCache) as string).characters,
    ).toEqual([{ name: "Fresh Hero", avatarUrl: "/fresh.png" }]);
  });

  it("keeps showing the cached sample when a fresh fetch returns empty or fails", async () => {
    localStorage.setItem(
      STORAGE_KEYS.landingCarouselCache,
      JSON.stringify({ characters: [{ name: "Cached Hero", avatarUrl: "/cached.png" }] }),
    );
    mockAuthenticatedFetch.mockResolvedValue({ json: async () => ({ characters: [] }) });

    render(<LandingCharacterCarousel />);
    await act(async () => {});

    expect(screen.getByLabelText("Chat with Cached Hero")).toBeInTheDocument();
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
