import { renderHook, act, waitFor } from "@testing-library/react";
import { useChatController } from "../../../src/app/components/chat/useChatController";

jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

jest.mock("../../../src/app/components/chat/useAudioPlayer", () => ({
  useAudioPlayer: () => ({
    playAudio: jest.fn(),
    stopAudio: jest.fn(),
    isAudioPlaying: () => false,
    audioRef: { current: { muted: false } },
  }),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

const voiceConfig = {
  languageCodes: ["en-US"],
  name: "en-US-Wavenet-D",
  ssmlGender: 1,
  pitch: 0,
  rate: 1,
  type: "Wavenet",
};
const bot = (name: string) => ({
  name,
  personality: "wise",
  avatarUrl: "/silhouette.svg",
  voiceConfig,
});

describe("useChatController when the bot changes mid-send", () => {
  it("drops the old bot's reply instead of adding it to the new bot's chat", async () => {
    let release!: (res: unknown) => void;
    mockAuthenticatedFetch.mockImplementation((url: string) =>
      url === "/api/chat"
        ? new Promise((resolve) => (release = resolve))
        : Promise.resolve({ ok: true, json: async () => ({}) }),
    );
    const { result, rerender } = renderHook(({ b }) => useChatController(b), {
      initialProps: { b: bot("Gandalf") },
    });
    // Skip the intro turn, then send a real message.
    await waitFor(() => expect(result.current.apiAvailable).toBe(true));
    act(() => result.current.setInput("hello"));
    act(() => {
      void result.current.sendMessage();
    });
    await waitFor(() => expect(release).toBeDefined());

    rerender({ b: bot("Merlin") });
    await act(async () => {
      release({ ok: true, json: async () => ({ reply: "You shall not pass" }) });
    });

    expect(result.current.messages.some((m) => m.text === "You shall not pass")).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});
