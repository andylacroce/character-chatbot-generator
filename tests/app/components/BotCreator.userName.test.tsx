import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import BotCreator from "../../../app/components/BotCreator";

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

const configHandler = () =>
  Promise.resolve({ json: () => Promise.resolve({ avatarTimeoutSeconds: 3 }) });
const safeValidationHandler = () =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        characterName: "Sherlock Holmes",
        isPublicDomain: true,
        isSafe: true,
        warningLevel: "none",
      }),
  });

describe("BotCreator - visitor name (identity chip, edit modal, post-creation gate)", () => {
  beforeEach(() => {
    mockSearchParams.delete("name");
    localStorage.clear();
  });

  afterEach(() => {
    // @ts-expect-error test-mock: remove mocked fetch from global
    delete global.fetch;
  });

  it('shows "Guest" on the identity label when no name is known', async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mockFetchRouter({ "/api/config": configHandler });

    render(<BotCreator onBotCreated={() => {}} />);
    fireEvent.click(await screen.findByLabelText("Open menu"));

    expect(screen.getByText("Guest")).toBeInTheDocument();
  });

  it('offers "Add your name" and "Sign in" once the account menu is opened', async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mockFetchRouter({ "/api/config": configHandler });

    render(<BotCreator onBotCreated={() => {}} />);
    fireEvent.click(await screen.findByLabelText("Open menu"));

    expect(screen.getByText("Add your name")).toBeInTheDocument();
    expect(screen.getByLabelText("Sign in")).toBeInTheDocument();
  });

  it('opens the name-edit modal from "Add your name" and persists the entered name', async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mockFetchRouter({ "/api/config": configHandler });

    render(<BotCreator onBotCreated={() => {}} />);
    fireEvent.click(await screen.findByLabelText("Open menu"));
    fireEvent.click(screen.getByText("Add your name"));

    const field = await screen.findByLabelText("Your name");
    fireEvent.change(field, { target: { value: "Andy" } });
    fireEvent.click(screen.getByText("Save"));

    expect(localStorage.getItem("chatbot-user-name")).toBe("Andy");
    fireEvent.click(await screen.findByLabelText("Open menu"));
    expect(screen.getByText("Andy")).toBeInTheDocument();
  });

  it("shows a signed-in user's stored preferred name on the identity label", async () => {
    mockUseSession.mockReturnValue({ data: { user: { id: "u1" } }, status: "authenticated" });
    mockFetchRouter({
      "/api/config": configHandler,
      "/api/bots": () => Promise.resolve({ json: () => Promise.resolve({ bots: [] }) }),
      "/api/user-profile": () =>
        Promise.resolve({ json: () => Promise.resolve({ name: "Ada Lovelace" }) }),
    });

    render(<BotCreator onBotCreated={() => {}} />);
    fireEvent.click(await screen.findByLabelText("Open menu"));

    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("gates character creation on the visitor's name when none is known yet, then proceeds after Skip", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mockFetchRouter({
      "/api/config": configHandler,
      "/api/validate-character": safeValidationHandler,
    });

    render(<BotCreator onBotCreated={() => {}} />);
    const input = await screen.findByTestId("bot-creator-input");
    fireEvent.change(input, { target: { value: "Sherlock Holmes" } });
    fireEvent.click(screen.getByTestId("bot-creator-button"));

    expect(await screen.findByText("Before we begin")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Skip for now"));

    // Proceeds past the gate into the normal validation step.
    expect(await screen.findByTestId("bot-creator-validating")).toBeInTheDocument();
    expect(localStorage.getItem("chatbot-user-name-gate-skipped")).toBe("1");
  });

  it("saves the name from the gate and proceeds, without asking again on a second character", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    mockFetchRouter({
      "/api/config": configHandler,
      "/api/validate-character": safeValidationHandler,
    });

    render(<BotCreator onBotCreated={() => {}} />);
    const input = await screen.findByTestId("bot-creator-input");
    fireEvent.change(input, { target: { value: "Sherlock Holmes" } });
    fireEvent.click(screen.getByTestId("bot-creator-button"));

    fireEvent.change(await screen.findByLabelText("Your name"), { target: { value: "Andy" } });
    fireEvent.click(screen.getByText("Continue"));

    expect(await screen.findByTestId("bot-creator-validating")).toBeInTheDocument();
    expect(localStorage.getItem("chatbot-user-name")).toBe("Andy");

    // A second creation run shouldn't show the gate again — the name is already known.
    await waitFor(() =>
      expect(screen.queryByTestId("bot-creator-validating")).not.toBeInTheDocument(),
    );
    fireEvent.change(screen.getByTestId("bot-creator-input"), { target: { value: "Cleopatra" } });
    fireEvent.click(screen.getByTestId("bot-creator-button"));

    expect(screen.queryByText("Before we begin")).not.toBeInTheDocument();
    expect(await screen.findByTestId("bot-creator-validating")).toBeInTheDocument();
  });
});
