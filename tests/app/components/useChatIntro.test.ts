import { renderHook, waitFor } from "@testing-library/react";
import { useChatIntro } from "../../../src/app/components/chat/useChatIntro";
import { authenticatedFetch } from "../../../src/utils/api";

jest.mock("../../../src/utils/api");
const mockAuth = authenticatedFetch as jest.MockedFunction<typeof authenticatedFetch>;

const bot = { name: "Ada", personality: "p", avatarUrl: "", voiceConfig: null, gender: null };
const voice = { name: "v", languageCodes: ["en-US"], ssmlGender: 1, pitch: 0, rate: 1 };

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    bot,
    messageCount: 0,
    apiAvailable: true,
    historyReconciled: true,
    ensureVoiceConfig: jest.fn().mockResolvedValue(voice),
    logMessage: jest.fn(),
    setError: jest.fn(),
    setMessages: jest.fn(),
    ...overrides,
  };
  const hook = renderHook((p) => useChatIntro(p as never), { initialProps: props });
  return { props, ...hook };
}

describe("useChatIntro", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockAuth.mockResolvedValue({ ok: true, json: async () => ({ reply: "Hello" }) } as Response);
  });

  it("requests an intro, stores it, and logs it", async () => {
    const { props, result } = setup();
    await waitFor(() => expect(props.setMessages).toHaveBeenCalled());
    const body = JSON.parse(String(mockAuth.mock.calls[0][1]?.body));
    expect(body.isIntro).toBe(true);
    expect(props.logMessage).toHaveBeenCalledWith(expect.objectContaining({ text: "Hello" }));
    await waitFor(() => expect(result.current.introLoading).toBe(false));
    expect(result.current.introError).toBeNull();
  });

  it.each([
    ["history exists", { messageCount: 2 }],
    ["the API is unavailable", { apiAvailable: false }],
    ["server history is not reconciled yet", { historyReconciled: false }],
  ])("does not request an intro when %s", async (_label, overrides) => {
    const { props } = setup(overrides);
    await Promise.resolve();
    expect(mockAuth).not.toHaveBeenCalled();
    expect(props.setMessages).not.toHaveBeenCalled();
  });

  it("reports an error when the voice config is missing", async () => {
    const { props, result } = setup({ ensureVoiceConfig: jest.fn().mockResolvedValue(null) });
    await waitFor(() => expect(result.current.introError).toMatch(/Voice configuration missing/));
    expect(props.setError).toHaveBeenCalledWith(expect.stringMatching(/Voice configuration/));
    expect(mockAuth).not.toHaveBeenCalled();
    expect(result.current.introLoading).toBe(false);
  });

  it("reports an error when the chat request fails", async () => {
    mockAuth.mockResolvedValue({ ok: false, status: 500 } as Response);
    const { props, result } = setup();
    await waitFor(() => expect(result.current.introError).toMatch(/Failed to generate intro/));
    expect(props.setError).toHaveBeenCalled();
    expect(props.setMessages).not.toHaveBeenCalled();
  });

  it("clears a previous intro error when the character changes", async () => {
    mockAuth.mockResolvedValue({ ok: false, status: 500 } as Response);
    const { props, result, rerender } = setup();
    await waitFor(() => expect(result.current.introError).not.toBeNull());
    mockAuth.mockResolvedValue({ ok: true, json: async () => ({ reply: "Hi" }) } as Response);
    rerender({ ...props, bot: { ...bot, name: "Bob" } });
    await waitFor(() => expect(result.current.introError).toBeNull());
  });
});
