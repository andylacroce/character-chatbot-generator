import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import HistoryPage from "@/src/app/components/HistoryPage";
import { persistedBotToBot } from "@/src/app/components/BotCreator";

const mockRouter = { push: jest.fn(), back: jest.fn() };
jest.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
}));

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  getProviders: () => Promise.resolve({ google: { id: "google", name: "Google" } }),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("@/src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

const authed = { data: { user: { id: "u1", email: "a@b.c" } }, status: "authenticated" };

function mockBots(bots: unknown[]) {
  mockAuthenticatedFetch.mockImplementation((url: string) =>
    Promise.resolve({
      json: async () => (url === "/api/bots" ? { bots } : { isAdmin: false }),
    }),
  );
}

describe("HistoryPage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("prompts a guest to sign in without fetching saved characters", () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    render(<HistoryPage />);
    expect(screen.getByText(/to see characters you've chatted with/)).toBeInTheDocument();
    expect(mockAuthenticatedFetch).not.toHaveBeenCalledWith("/api/bots");
  });

  it("shows a loading state while the session resolves", () => {
    mockUseSession.mockReturnValue({ data: null, status: "loading" });
    render(<HistoryPage />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your chats");
  });

  it("lists every saved character with a relative time, each linking to its resume URL", async () => {
    mockUseSession.mockReturnValue(authed);
    mockBots([
      {
        id: "b1",
        name: "Sherlock Holmes",
        personality: "p",
        avatarUrl: "https://blob.example.com/s.png",
        gender: "male",
        voiceConfig: null,
        updatedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
      },
      ...Array.from({ length: 5 }, (_, i) => ({
        id: `x${i}`,
        name: `Character ${i}`,
        personality: "p",
        avatarUrl: null,
        gender: null,
        voiceConfig: null,
        updatedAt: new Date().toISOString(),
      })),
    ]);

    render(<HistoryPage />);

    const link = (await screen.findByText("Sherlock Holmes")).closest("a");
    expect(link).toHaveAttribute("href", "/?name=Sherlock%20Holmes");
    expect(screen.getByText("2 hours ago")).toBeInTheDocument();
    // No truncation — the whole list is shown on its own page.
    expect(screen.getByText("Character 4")).toBeInTheDocument();
  });

  it("shows an empty state when there are no saved characters, or the fetch fails", async () => {
    mockUseSession.mockReturnValue(authed);
    mockAuthenticatedFetch.mockRejectedValue(new Error("down"));
    render(<HistoryPage />);
    expect(await screen.findByText(/No saved chats yet/)).toBeInTheDocument();
  });

  it("Back falls back to / on a direct load", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    render(<HistoryPage />);
    fireEvent.click(screen.getByText("Back"));
    await waitFor(() => expect(mockRouter.push).toHaveBeenCalledWith("/"));
  });
});

describe("persistedBotToBot", () => {
  it("maps a saved row to a Bot, falling back to the silhouette avatar", () => {
    expect(
      persistedBotToBot({
        id: "b",
        name: "Cleopatra",
        personality: "A queen.",
        avatarUrl: null,
        gender: "female",
        voiceConfig: null,
        updatedAt: "",
      }),
    ).toEqual({
      name: "Cleopatra",
      personality: "A queen.",
      avatarUrl: "/silhouette.svg",
      voiceConfig: null,
      gender: "female",
    });
  });
});
