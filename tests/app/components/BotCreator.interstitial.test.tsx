import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import BotCreator from "../../../app/components/BotCreator";

// Mock next/navigation
const mockSearchParams = new URLSearchParams();
const mockRouter = { push: jest.fn() };
jest.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => mockRouter,
}));

// BotCreator renders AuthControl, which needs a SessionProvider ancestor
// (next-auth throws otherwise) — mock the hook directly instead.
const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  getProviders: () => Promise.resolve({ google: { id: "google", name: "Google" } }),
}));

function mockFetchRouter(handlers: Record<string, () => Promise<unknown>>) {
  // @ts-expect-error test-mock: assign mocked fetch to global
  global.fetch = jest.fn((url: string) => {
    for (const [prefix, handler] of Object.entries(handlers)) {
      if (url === prefix || url.startsWith(prefix)) return handler();
    }
    return Promise.reject(new Error(`Unmocked URL: ${url}`));
  });
}

describe("BotCreator resume/new-chat interstitial", () => {
  beforeEach(() => {
    mockSearchParams.delete("name");
    mockRouter.push.mockClear();
  });

  afterEach(() => {
    // @ts-expect-error test-mock: remove mocked fetch from global
    delete global.fetch;
  });

  it('shows a "Resuming..." interstitial before dispatching a match found via ?name=X, then clears it', async () => {
    mockSearchParams.set("name", "Sherlock Holmes");
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });
    const savedBot = {
      id: "b1",
      name: "Sherlock Holmes",
      personality: "p",
      avatarUrl: null,
      gender: null,
      voiceConfig: null,
      updatedAt: new Date().toISOString(),
    };
    mockFetchRouter({
      "/api/config": () =>
        Promise.resolve({ json: () => Promise.resolve({ avatarTimeoutSeconds: 3 }) }),
      "/api/bots": () => Promise.resolve({ json: () => Promise.resolve({ bots: [savedBot] }) }),
    });
    const onBotCreated = jest.fn();

    render(<BotCreator onBotCreated={onBotCreated} />);

    expect(await screen.findByTestId("bot-creator-interstitial")).toHaveTextContent(
      "Resuming your chat with Sherlock Holmes",
    );
    expect(onBotCreated).not.toHaveBeenCalled();

    await waitFor(
      () =>
        expect(onBotCreated).toHaveBeenCalledWith(
          expect.objectContaining({ name: "Sherlock Holmes" }),
        ),
      { timeout: 3000 },
    );
    expect(screen.queryByTestId("bot-creator-interstitial")).not.toBeInTheDocument();
  });

  it('shows a "Starting a new chat..." interstitial before falling back to fresh creation when no saved match exists', async () => {
    mockSearchParams.set("name", "Someone New");
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });
    mockFetchRouter({
      "/api/config": () =>
        Promise.resolve({ json: () => Promise.resolve({ avatarTimeoutSeconds: 3 }) }),
      "/api/bots": () => Promise.resolve({ json: () => Promise.resolve({ bots: [] }) }),
    });

    render(<BotCreator onBotCreated={() => {}} />);

    expect(await screen.findByTestId("bot-creator-interstitial")).toHaveTextContent(
      "Starting a new chat with Someone New",
    );

    await waitFor(
      () => expect(global.fetch).toHaveBeenCalledWith("/api/validate-character", expect.anything()),
      { timeout: 3000 },
    );
    expect(screen.queryByTestId("bot-creator-interstitial")).not.toBeInTheDocument();
  });

  it("does not show an interstitial for a guest launching via ?name=X (no ambiguity to resolve)", async () => {
    mockSearchParams.set("name", "Sherlock Holmes");
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mockFetchRouter({
      "/api/config": () =>
        Promise.resolve({ json: () => Promise.resolve({ avatarTimeoutSeconds: 3 }) }),
    });

    render(<BotCreator onBotCreated={() => {}} />);

    await waitFor(() => expect(screen.getByTestId("bot-creator-validating")).toBeInTheDocument());
    expect(screen.queryByTestId("bot-creator-interstitial")).not.toBeInTheDocument();
  });

  it('shows a "Resuming..." interstitial when picking a character from the "Previously" dropdown, hiding the rest of the form meanwhile', async () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });
    const savedBot = {
      id: "b1",
      name: "Dracula",
      personality: "A vampire.",
      avatarUrl: null,
      gender: "male",
      voiceConfig: null,
      updatedAt: new Date().toISOString(),
    };
    mockFetchRouter({
      "/api/config": () =>
        Promise.resolve({ json: () => Promise.resolve({ avatarTimeoutSeconds: 3 }) }),
      "/api/bots": () => Promise.resolve({ json: () => Promise.resolve({ bots: [savedBot] }) }),
    });
    const onBotCreated = jest.fn();

    render(<BotCreator onBotCreated={onBotCreated} />);

    fireEvent.click(await screen.findByText("Dracula"));

    expect(await screen.findByTestId("bot-creator-interstitial")).toHaveTextContent(
      "Resuming your chat with Dracula",
    );
    // The ordinary hero/input form is hidden while the interstitial is up.
    expect(screen.queryByLabelText("Character name")).not.toBeInTheDocument();
    expect(onBotCreated).not.toHaveBeenCalled();

    await waitFor(
      () => expect(onBotCreated).toHaveBeenCalledWith(expect.objectContaining({ name: "Dracula" })),
      { timeout: 3000 },
    );
    expect(screen.queryByTestId("bot-creator-interstitial")).not.toBeInTheDocument();
  });

  it("Cancel on a URL-driven interstitial navigates back to /chars without dispatching, and lets the same link work again later", async () => {
    mockSearchParams.set("name", "Sherlock Holmes");
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });
    const savedBot = {
      id: "b1",
      name: "Sherlock Holmes",
      personality: "p",
      avatarUrl: null,
      gender: null,
      voiceConfig: null,
      updatedAt: new Date().toISOString(),
    };
    mockFetchRouter({
      "/api/config": () =>
        Promise.resolve({ json: () => Promise.resolve({ avatarTimeoutSeconds: 3 }) }),
      "/api/bots": () => Promise.resolve({ json: () => Promise.resolve({ bots: [savedBot] }) }),
    });
    const onBotCreated = jest.fn();

    render(<BotCreator onBotCreated={onBotCreated} />);

    await screen.findByTestId("bot-creator-interstitial");
    fireEvent.click(screen.getByLabelText("Cancel"));

    expect(screen.queryByTestId("bot-creator-interstitial")).not.toBeInTheDocument();
    expect(mockRouter.push).toHaveBeenCalledWith("/chars");

    // Give the interstitial's deferred dispatch a chance to fire if it wasn't
    // actually cancelled — it must not be.
    await new Promise((r) => setTimeout(r, 50));
    expect(onBotCreated).not.toHaveBeenCalled();
  });

  it("Cancel on a dropdown-driven interstitial returns to the ordinary form without navigating or dispatching", async () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });
    const savedBot = {
      id: "b1",
      name: "Dracula",
      personality: "A vampire.",
      avatarUrl: null,
      gender: "male",
      voiceConfig: null,
      updatedAt: new Date().toISOString(),
    };
    mockFetchRouter({
      "/api/config": () =>
        Promise.resolve({ json: () => Promise.resolve({ avatarTimeoutSeconds: 3 }) }),
      "/api/bots": () => Promise.resolve({ json: () => Promise.resolve({ bots: [savedBot] }) }),
    });
    const onBotCreated = jest.fn();

    render(<BotCreator onBotCreated={onBotCreated} />);

    fireEvent.click(await screen.findByText("Dracula"));
    await screen.findByTestId("bot-creator-interstitial");
    fireEvent.click(screen.getByLabelText("Cancel"));

    expect(screen.queryByTestId("bot-creator-interstitial")).not.toBeInTheDocument();
    expect(mockRouter.push).not.toHaveBeenCalled();
    // Back to the ordinary form, not stuck on a loading state.
    expect(await screen.findByLabelText("Character name")).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, 50));
    expect(onBotCreated).not.toHaveBeenCalled();
  });

  it("Cancel clicked further downstream (validating step, reached via ?name=X with no saved match) still kicks all the way back to /chars", async () => {
    // Regression: cancelling from the generation-progress screen (a step past the
    // interstitial) used to only clear loading/progress, leaving isLaunchingFromUrl
    // true and the guard already tripped — so it re-showed "Loading..." forever
    // instead of actually backing out of the launch.
    mockSearchParams.set("name", "Someone New");
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });
    mockFetchRouter({
      "/api/config": () =>
        Promise.resolve({ json: () => Promise.resolve({ avatarTimeoutSeconds: 3 }) }),
      "/api/bots": () => Promise.resolve({ json: () => Promise.resolve({ bots: [] }) }),
      "/api/validate-character": () =>
        new Promise(() => {
          /* never resolves */
        }),
    });
    const onBotCreated = jest.fn();

    render(<BotCreator onBotCreated={onBotCreated} />);

    await screen.findByTestId("bot-creator-interstitial");
    await waitFor(() => expect(screen.getByTestId("bot-creator-validating")).toBeInTheDocument(), {
      timeout: 3000,
    });

    fireEvent.click(screen.getByLabelText("Cancel"));

    expect(mockRouter.push).toHaveBeenCalledWith("/chars");
    expect(screen.queryByTestId("bot-creator-auto-launch")).not.toBeInTheDocument();
    expect(onBotCreated).not.toHaveBeenCalled();
  });

  it("Cancel clicked during validating from the ordinary landing-page form (no ?name=X) stays on the form, no navigation", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mockFetchRouter({
      "/api/config": () =>
        Promise.resolve({ json: () => Promise.resolve({ avatarTimeoutSeconds: 3 }) }),
      "/api/validate-character": () =>
        new Promise(() => {
          /* never resolves */
        }),
    });
    const onBotCreated = jest.fn();

    render(<BotCreator onBotCreated={onBotCreated} />);

    const input = await screen.findByLabelText("Character name");
    fireEvent.change(input, { target: { value: "Merlin" } });
    fireEvent.click(screen.getByTestId("bot-creator-button"));

    await screen.findByTestId("bot-creator-validating");
    fireEvent.click(screen.getByLabelText("Cancel"));

    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(await screen.findByLabelText("Character name")).toBeInTheDocument();
    expect(onBotCreated).not.toHaveBeenCalled();
  });
});
