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
const mockSignOut = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  signIn: jest.fn(),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  getProviders: () => Promise.resolve({ google: { id: "google", name: "Google" } }),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("@/src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

const authed = { data: { user: { id: "u1", email: "a@b.c" } }, status: "authenticated" };

function mockBots(bots: unknown[], deleteOk = true) {
  mockAuthenticatedFetch.mockImplementation((url: string, init?: RequestInit) =>
    Promise.resolve(
      init?.method === "DELETE"
        ? { ok: deleteOk, status: deleteOk ? 200 : 500, json: async () => ({}) }
        : { json: async () => (url === "/api/bots" ? { bots } : { isAdmin: false }) },
    ),
  );
}

const savedBot = (id: string, name: string) => ({
  id,
  name,
  personality: "p",
  avatarUrl: null,
  gender: null,
  voiceConfig: null,
  updatedAt: new Date().toISOString(),
});

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

  describe("deleting chats", () => {
    beforeEach(() => {
      localStorage.clear();
      mockUseSession.mockReturnValue(authed);
    });

    it("deletes one chat after confirming, removing its row and local history", async () => {
      localStorage.setItem("chatbot-history-Zeus", "[]");
      localStorage.setItem("chatbot-history-Hera", "[]");
      mockBots([savedBot("b1", "Zeus"), savedBot("b2", "Hera")]);
      render(<HistoryPage />);

      fireEvent.click(await screen.findByLabelText("Delete chat with Zeus"));
      expect(screen.getByText("Delete your chat with Zeus?")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(screen.queryByText("Zeus")).toBeNull());
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith("/api/bots?id=b1", {
        method: "DELETE",
      });
      expect(screen.getByText("Hera")).toBeInTheDocument();
      expect(localStorage.getItem("chatbot-history-Zeus")).toBeNull();
      expect(localStorage.getItem("chatbot-history-Hera")).toBe("[]");
    });

    it("keeps the chat when the delete fails", async () => {
      mockBots([savedBot("b1", "Zeus")], false);
      render(<HistoryPage />);
      fireEvent.click(await screen.findByLabelText("Delete chat with Zeus"));
      fireEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete this chat");
      expect(screen.getByText("Zeus")).toBeInTheDocument();
    });

    it("clears every chat after confirming", async () => {
      localStorage.setItem("chatbot-history-Zeus", "[]");
      localStorage.setItem("darkMode", "true");
      mockBots([savedBot("b1", "Zeus"), savedBot("b2", "Hera")]);
      render(<HistoryPage />);

      fireEvent.click(await screen.findByText("Clear all chats"));
      fireEvent.click(screen.getByRole("button", { name: "Clear history" }));

      expect(await screen.findByText(/No saved chats yet/)).toBeInTheDocument();
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith("/api/bots", { method: "DELETE" });
      expect(localStorage.getItem("chatbot-history-Zeus")).toBeNull();
      expect(localStorage.getItem("darkMode")).toBe("true");
    });
  });

  it("account menu: deletes the account after confirming, then clears local data and signs out", async () => {
    localStorage.setItem("chatbot-user-name", "Andy");
    localStorage.setItem("darkMode", "true");
    mockUseSession.mockReturnValue(authed);
    mockBots([]);
    render(<HistoryPage />);

    fireEvent.click(screen.getByLabelText(/open menu/i));
    fireEvent.click(await screen.findByText("Delete account"));
    fireEvent.click(screen.getAllByRole("button", { name: "Delete account" }).at(-1)!);

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" }));
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith("/api/account", { method: "DELETE" });
    expect(localStorage.getItem("chatbot-user-name")).toBeNull();
    expect(localStorage.getItem("darkMode")).toBe("true");
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
