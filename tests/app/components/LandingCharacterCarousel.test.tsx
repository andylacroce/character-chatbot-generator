import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
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
    // The component shuffles the fetched pool client-side (see shuffled() in
    // LandingCharacterCarousel.tsx) so it isn't always the same newest-first order
    // /api/chars returns. A random value near 1 makes Fisher-Yates a no-op for these
    // small fixture arrays (each swap index resolves to itself), keeping fixture
    // order predictable for assertions without weakening the shuffle logic itself.
    jest.spyOn(Math, "random").mockReturnValue(0.99);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("renders nothing while loading and nothing when the list comes back empty", async () => {
    mockAuthenticatedFetch.mockResolvedValue({ json: async () => ({ characters: [] }) });
    const { container } = render(<LandingCharacterCarousel />);
    expect(container.firstChild).toBeNull();
    await waitFor(() =>
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith("/api/chars?limit=100"),
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when the fetch fails", async () => {
    mockAuthenticatedFetch.mockRejectedValue(new Error("network down"));
    const { container } = render(<LandingCharacterCarousel />);
    await waitFor(() => expect(mockAuthenticatedFetch).toHaveBeenCalled());
    expect(container.firstChild).toBeNull();
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

    jest.advanceTimersByTime(4000);

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
    jest.advanceTimersByTime(6000);
    expect(screen.getByLabelText("Chat with Sherlock Holmes")).toBeInTheDocument();

    fireEvent.mouseLeave(button);
    jest.advanceTimersByTime(4000);
    expect(await screen.findByLabelText("Chat with Cleopatra")).toBeInTheDocument();
  });
});
