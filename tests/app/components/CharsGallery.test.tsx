import React from "react";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import CharsGallery from "@/app/components/CharsGallery";

const mockAuthenticatedFetch = jest.fn();
jest.mock("@/src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

// CharsGallery renders AuthControl, which needs a SessionProvider ancestor
// (next-auth throws otherwise) — mock the hook directly instead, same pattern
// as BotCreator.url.test.tsx.
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  signIn: jest.fn(),
  signOut: jest.fn(),
  getProviders: () => Promise.resolve({ google: { id: "google", name: "Google" } }),
}));

// jsdom doesn't implement <dialog>'s showModal()/close() (verified against the
// installed jsdom version) — polyfill just enough for the open/close behavior
// this component actually relies on, same pattern as jest.setup.js's
// HTMLMediaElement play/pause polyfill.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});

// Controllable IntersectionObserver: every instance is recorded so a test can
// manually fire "entered view" for the per-tile reveal and the infinite-scroll
// sentinel, since jsdom never actually scrolls anything.
let observers: Array<{ callback: IntersectionObserverCallback; target: Element | null }> = [];
beforeEach(() => {
  observers = [];
  mockAuthenticatedFetch.mockReset();
  (global as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      observers.push({ callback, target: null });
    }
    observe(target: Element) {
      observers[observers.length - 1].target = target;
    }
    disconnect() { }
    unobserve() { }
  };
});

function fireAllIntersections() {
  // The observer callbacks below trigger React state updates (setVisible,
  // loadMore) outside of RTL's own event-dispatch machinery, so they need an
  // explicit act() wrapper — without it, React 18 can silently drop the
  // resulting updates in a way waitFor never observes.
  act(() => {
    observers.forEach(({ callback, target }) => {
      if (!target) return;
      callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
  });
}

function mockPage(characters: Array<{ name: string; avatarUrl: string }>, hasMore: boolean) {
  return { json: async () => ({ characters, hasMore }) };
}

describe("CharsGallery", () => {
  it("shows a loading state, then the gallery once the first page resolves", async () => {
    mockAuthenticatedFetch.mockResolvedValue(mockPage([{ name: "Ada Lovelace", avatarUrl: "/a.png" }], false));
    render(<CharsGallery />);
    expect(screen.getByText(/loading portraits/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTitle("Ada Lovelace")).toBeInTheDocument());
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith("/api/chars?limit=60&offset=0");
  });

  it("shows an empty state when there are no characters yet", async () => {
    mockAuthenticatedFetch.mockResolvedValue(mockPage([], false));
    render(<CharsGallery />);
    await waitFor(() => expect(screen.getByText(/go create the first one/i)).toBeInTheDocument());
  });

  it("shows an error state when the fetch fails and nothing has loaded", async () => {
    mockAuthenticatedFetch.mockRejectedValue(new Error("network down"));
    render(<CharsGallery />);
    await waitFor(() => expect(screen.getByText(/couldn't load the gallery/i)).toBeInTheDocument());
  });

  it("fetches the next page when the sentinel scrolls into view, and stops once hasMore is false", async () => {
    mockAuthenticatedFetch
      .mockResolvedValueOnce(mockPage([{ name: "Ada Lovelace", avatarUrl: "/a.png" }], true))
      .mockResolvedValueOnce(mockPage([{ name: "Sherlock Holmes", avatarUrl: "/s.png" }], false));

    render(<CharsGallery />);
    await waitFor(() => expect(screen.getByTitle("Ada Lovelace")).toBeInTheDocument());

    fireAllIntersections();
    await waitFor(() => expect(screen.getByTitle("Sherlock Holmes")).toBeInTheDocument());
    expect(mockAuthenticatedFetch).toHaveBeenNthCalledWith(2, "/api/chars?limit=60&offset=1");

    // hasMore is now false — no further page fetch should happen even if the
    // sentinel intersects again.
    fireAllIntersections();
    await waitFor(() => expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(2));
  });

  it("opens the lightbox on tile click and closes it via the close button", async () => {
    mockAuthenticatedFetch.mockResolvedValue(mockPage([{ name: "Ada Lovelace", avatarUrl: "/a.png" }], false));
    render(<CharsGallery />);
    await waitFor(() => expect(screen.getByTitle("Ada Lovelace")).toBeInTheDocument());

    fireEvent.click(screen.getByTitle("Ada Lovelace"));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    await waitFor(() => expect(dialog.open).toBe(true));
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    await waitFor(() => expect(dialog.open).toBe(false));
  });

  it("closes the lightbox when the backdrop (the dialog element itself) is clicked", async () => {
    mockAuthenticatedFetch.mockResolvedValue(mockPage([{ name: "Ada Lovelace", avatarUrl: "/a.png" }], false));
    render(<CharsGallery />);
    await waitFor(() => expect(screen.getByTitle("Ada Lovelace")).toBeInTheDocument());

    fireEvent.click(screen.getByTitle("Ada Lovelace"));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    await waitFor(() => expect(dialog.open).toBe(true));

    fireEvent.click(dialog);
    await waitFor(() => expect(dialog.open).toBe(false));
  });
});
