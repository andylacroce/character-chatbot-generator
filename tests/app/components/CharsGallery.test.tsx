import React from "react";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import CharsGallery from "@/app/components/CharsGallery";
import {
  markClientNavigation,
  __resetClientNavigationStateForTest,
} from "@/src/utils/clientNavigationState";

const mockAuthenticatedFetch = jest.fn();
const mockRouterBack = jest.fn();
const mockRouterPush = jest.fn();
jest.mock("@/src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));
jest.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockRouterBack, push: mockRouterPush }),
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
// manually fire visibility changes for the top marker and infinite-scroll sentinel,
// since jsdom never actually scrolls anything.
let observers: Array<{ callback: IntersectionObserverCallback; target: Element | null }> = [];
// When true, observe() itself immediately delivers an "intersecting" entry — real
// IntersectionObserver behavior for a target that starts out already in view, used
// to simulate a sentinel that never actually leaves the viewport (e.g. a collapsed
// grouped view, or simply a tall one) and so never gets a fresh threshold-crossing
// callback on its own.
let sentinelStaysVisible = false;
beforeEach(() => {
  observers = [];
  sentinelStaysVisible = false;
  mockAuthenticatedFetch.mockReset();
  mockRouterBack.mockReset();
  mockRouterPush.mockReset();
  __resetClientNavigationStateForTest();
  (global as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      observers.push({ callback, target: null });
    }
    observe(target: Element) {
      observers[observers.length - 1].target = target;
      if (sentinelStaysVisible) {
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
    }
    disconnect() {}
    unobserve() {}
  };
});

function fireAllIntersections() {
  // The observer callbacks below trigger React state updates outside of RTL's
  // own event-dispatch machinery, so they need an
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

function mockPage(
  characters: Array<{ name: string; avatarUrl: string; category?: string }>,
  hasMore: boolean,
) {
  return { json: async () => ({ characters, hasMore }) };
}

describe("CharsGallery", () => {
  it("shows a loading state, then the gallery once the first page resolves", async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      mockPage([{ name: "Ada Lovelace", avatarUrl: "/a.png" }], false),
    );
    render(<CharsGallery />);
    expect(screen.getByText(/loading portraits/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTitle("Ada Lovelace")).toBeInTheDocument());
    expect(screen.queryByText(/character study/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/POR\s*·/i)).not.toBeInTheDocument();
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      "/api/chars?limit=60&offset=0&sort=newest&group=none",
    );
  });

  it("places the complete loaded page in one portrait mosaic", async () => {
    const characters = Array.from({ length: 17 }, (_, index) => ({
      name: `Character ${index + 1}`,
      avatarUrl: `/${index + 1}.png`,
    }));
    mockAuthenticatedFetch.mockResolvedValue(mockPage(characters, false));

    render(<CharsGallery />);

    const mosaic = await screen.findByRole("region", { name: /portrait collection/i });
    expect(within(mosaic).getAllByRole("button", { name: /open portrait/i })).toHaveLength(17);
  });

  it("shows an empty state when there are no characters yet", async () => {
    mockAuthenticatedFetch.mockResolvedValue(mockPage([], false));
    render(<CharsGallery />);
    await waitFor(() => expect(screen.getByText(/go create the first one/i)).toBeInTheDocument());
  });

  it("uses browser history for the wall's universal Back control when reached via in-app navigation", async () => {
    mockAuthenticatedFetch.mockResolvedValue(mockPage([], false));
    markClientNavigation();
    render(<CharsGallery />);

    const backLink = screen.getByRole("link", { name: /^back$/i });
    fireEvent.click(backLink);
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  it("falls back to Home when the wall was reached with no in-app history to return to", async () => {
    // A direct load (new tab, bookmark, shared link) still reports
    // window.history.length > 1 in real browsers, thanks to the tab's own
    // pre-existing about:blank entry — this regression test pins that the
    // fallback decision no longer trusts that count. See
    // src/utils/clientNavigationState.ts for the mechanism this replaced it with.
    mockAuthenticatedFetch.mockResolvedValue(mockPage([], false));
    render(<CharsGallery />);

    const backLink = screen.getByRole("link", { name: /^back$/i });
    fireEvent.click(backLink);
    expect(mockRouterPush).toHaveBeenCalledWith("/");
    expect(mockRouterBack).not.toHaveBeenCalled();
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
    expect(mockAuthenticatedFetch).toHaveBeenNthCalledWith(
      2,
      "/api/chars?limit=60&offset=1&sort=newest&group=none",
    );

    // hasMore is now false — no further page fetch should happen even if the
    // sentinel intersects again.
    fireAllIntersections();
    await waitFor(() => expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(2));
  });

  it("keeps paginating when the sentinel never leaves view instead of stalling after one page", async () => {
    // A collapsed grouped view (or just a short page on a tall viewport) can leave
    // the sentinel continuously visible, which a plain IntersectionObserver never
    // reports again on its own — the component must re-observe on every data
    // update to keep pulling pages rather than silently stopping partway through.
    sentinelStaysVisible = true;
    mockAuthenticatedFetch
      .mockResolvedValueOnce(mockPage([{ name: "Ada Lovelace", avatarUrl: "/a.png" }], true))
      .mockResolvedValueOnce(mockPage([{ name: "Sherlock Holmes", avatarUrl: "/s.png" }], true))
      .mockResolvedValueOnce(mockPage([{ name: "Marie Curie", avatarUrl: "/m.png" }], false));

    render(<CharsGallery />);

    await waitFor(() => expect(screen.getByTitle("Marie Curie")).toBeInTheDocument());
    expect(screen.getByTitle("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByTitle("Sherlock Holmes")).toBeInTheDocument();
    expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(3);
  });

  it("opens the lightbox on tile click and closes it via the close button", async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      mockPage([{ name: "Ada Lovelace", avatarUrl: "/a.png" }], false),
    );
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
    mockAuthenticatedFetch.mockResolvedValue(
      mockPage([{ name: "Ada Lovelace", avatarUrl: "/a.png" }], false),
    );
    render(<CharsGallery />);
    await waitFor(() => expect(screen.getByTitle("Ada Lovelace")).toBeInTheDocument());

    fireEvent.click(screen.getByTitle("Ada Lovelace"));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    await waitFor(() => expect(dialog.open).toBe(true));

    fireEvent.click(dialog);
    await waitFor(() => expect(dialog.open).toBe(false));
  });

  it("closes the lightbox when the zoomed image itself is clicked", async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      mockPage([{ name: "Ada Lovelace", avatarUrl: "/a.png" }], false),
    );
    render(<CharsGallery />);
    await waitFor(() => expect(screen.getByTitle("Ada Lovelace")).toBeInTheDocument());

    fireEvent.click(screen.getByTitle("Ada Lovelace"));
    const dialog = document.querySelector("dialog") as HTMLDialogElement;
    await waitFor(() => expect(dialog.open).toBe(true));

    fireEvent.click(within(dialog).getByAltText("Ada Lovelace"));
    await waitFor(() => expect(dialog.open).toBe(false));
  });

  it("reveals the back-to-top control from the body scroll owner and scrolls to the marker", async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      mockPage([{ name: "Ada Lovelace", avatarUrl: "/a.png" }], false),
    );

    render(<CharsGallery />);
    await screen.findByTitle("Ada Lovelace");

    const marker = screen.getByTestId("gallery-top-marker");
    Object.defineProperty(document.body, "scrollTop", { configurable: true, value: 420 });
    fireEvent.scroll(document.body);

    const scrollIntoView = jest.fn();
    marker.scrollIntoView = scrollIntoView;
    const control = screen.getByRole("button", { name: /back to top/i });
    fireEvent.click(control);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "smooth" });
    Object.defineProperty(document.body, "scrollTop", { configurable: true, value: 0 });
  });

  it("reloads server-ordered results when sorting changes", async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      mockPage([{ name: "Ada Lovelace", avatarUrl: "/a.png", category: "history" }], false),
    );
    render(<CharsGallery />);
    await screen.findByTitle("Ada Lovelace");

    fireEvent.change(screen.getByLabelText(/sort by/i), { target: { value: "name-asc" } });

    await waitFor(() =>
      expect(mockAuthenticatedFetch).toHaveBeenLastCalledWith(
        "/api/chars?limit=60&offset=0&sort=name-asc&group=none",
      ),
    );
  });

  it("groups behind an off-by-default toggle and starts each category collapsed", async () => {
    mockAuthenticatedFetch.mockResolvedValue(
      mockPage(
        [
          { name: "Ada Lovelace", avatarUrl: "/a.png", category: "history" },
          { name: "Athena", avatarUrl: "/athena.png", category: "mythology" },
        ],
        false,
      ),
    );
    render(<CharsGallery />);
    await screen.findByTitle("Ada Lovelace");

    const groupingToggle = screen.getByRole("checkbox", { name: /group by category/i });
    expect(groupingToggle).not.toBeChecked();
    fireEvent.click(groupingToggle);

    const historyGroup = await screen.findByRole("button", { name: /historical figures/i });
    const mythologyGroup = screen.getByRole("button", { name: /mythology/i });
    expect(historyGroup).toHaveAttribute("aria-expanded", "false");
    expect(mythologyGroup).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTitle("Ada Lovelace")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Athena")).not.toBeInTheDocument();
    expect(mockAuthenticatedFetch).toHaveBeenLastCalledWith(
      "/api/chars?limit=60&offset=0&sort=newest&group=category",
    );

    fireEvent.click(historyGroup);
    expect(historyGroup).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByTitle("Ada Lovelace")).toBeInTheDocument();
    expect(screen.queryByTitle("Athena")).not.toBeInTheDocument();
  });
});
