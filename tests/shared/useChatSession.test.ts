import { act, renderHook, waitFor } from "@testing-library/react";
import {
  httpError,
  useChatSession,
  type Bot,
  type ChatAuthStatus,
  type ChatStorage,
  type ChatTransport,
  type ChatTurn,
} from "character-chatbot-shared";

const voice = { languageCodes: ["en-US"], name: "v", ssmlGender: 1, pitch: 0, rate: 1 };
const makeBot = (name: string, voiceConfig: Bot["voiceConfig"] = voice as never): Bot => ({
  name,
  personality: "p",
  avatarUrl: "/a.png",
  voiceConfig,
});

function setup(initial: { bot?: Bot; auth?: ChatAuthStatus; history?: ChatTurn[] } = {}) {
  const db: Record<string, ChatTurn[]> = { Ada: initial.history ?? [] };
  const transport = {
    send: jest.fn().mockResolvedValue({ reply: "Hello", done: true }),
    fetchHistory: jest.fn().mockResolvedValue([]),
    fetchVoiceConfig: jest.fn().mockResolvedValue(voice),
  } satisfies ChatTransport;
  const storage: ChatStorage = {
    load: (name) => db[name] ?? [],
    save: (name, list) => {
      db[name] = list;
    },
  };
  const log = jest.fn();
  const hook = renderHook(
    (p: { bot: Bot; auth: ChatAuthStatus }) =>
      useChatSession({ bot: p.bot, authStatus: p.auth, transport, storage, log }),
    { initialProps: { bot: initial.bot ?? makeBot("Ada"), auth: initial.auth ?? "signedOut" } },
  );
  return { transport, db, log, ...hook };
}

describe("useChatSession", () => {
  it("sends the intro once for a fresh chat and saves it", async () => {
    const { result, transport, db } = setup();
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.send.mock.calls[0][0]).toMatchObject({ isIntro: true, botName: "Ada" });
    expect(db.Ada).toEqual([{ sender: "Ada", text: "Hello", audioFileUrl: undefined }]);
  });

  it("holds the intro until sign-in resolves, then adopts the longer server history instead", async () => {
    const server = [
      { sender: "User", text: "hi" },
      { sender: "Ada", text: "hello" },
    ];
    const { result, transport, rerender } = setup({ auth: "loading" });
    await act(async () => {});
    expect(transport.send).not.toHaveBeenCalled();

    transport.fetchHistory.mockResolvedValue(server);
    rerender({ bot: makeBot("Ada"), auth: "signedIn" });
    await waitFor(() => expect(result.current.messages).toEqual(server));
    expect(transport.send).not.toHaveBeenCalled();
  });

  it("still sends the intro for a signed-in user whose server history is empty", async () => {
    const { result, transport } = setup({ auth: "signedIn" });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(transport.fetchHistory).toHaveBeenCalledWith("Ada");
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it("retries a failed intro", async () => {
    const { result, transport } = setup();
    transport.send.mockReset();
    transport.send
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValue({ reply: "Hello", done: true });
    await waitFor(() => expect(result.current.messages).toHaveLength(1));
    expect(transport.send).toHaveBeenCalledTimes(2);
    expect(result.current.introError).toBeNull();
  });

  it("sends a turn with prior history and appends the reply", async () => {
    const history = [{ sender: "Ada", text: "Greetings" }];
    const { result, transport } = setup({ history });
    await act(async () => {
      await result.current.send("How are you?");
    });
    expect(transport.send).toHaveBeenCalledWith(
      expect.objectContaining({ message: "How are you?", conversationHistory: ["Bot: Greetings"] }),
    );
    expect(result.current.messages.map((m) => m.text)).toEqual([
      "Greetings",
      "How are you?",
      "Hello",
    ]);
    expect(result.current.sending).toBe(false);
  });

  it("does not retry a 4xx and shows a friendly message, never the body", async () => {
    const { result, transport } = setup({ history: [{ sender: "Ada", text: "Greetings" }] });
    transport.send.mockRejectedValue(Object.assign(new Error('{"error":"raw"}'), { status: 400 }));
    await act(async () => {
      await result.current.send("hi");
    });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe("Error sending message. Please try again.");
    expect(result.current.sending).toBe(false);
  });

  it("drops a reply that arrives after the character changed", async () => {
    const { result, transport, rerender } = setup({
      history: [{ sender: "Ada", text: "Greetings" }],
    });
    let release!: (value: unknown) => void;
    transport.send.mockImplementation(() => new Promise((resolve) => (release = resolve)));
    act(() => {
      void result.current.send("hi");
    });
    await waitFor(() => expect(release).toBeDefined());

    rerender({ bot: makeBot("Merlin"), auth: "signedOut" });
    await act(async () => {
      release({ reply: "Late", done: true });
    });
    expect(result.current.messages.some((m) => m.text === "Late")).toBe(false);
    expect(result.current.sending).toBe(false);
  });

  it("fetches a missing voice config instead of sending without one", async () => {
    const { result, transport } = setup({
      bot: makeBot("Ada", null),
      history: [{ sender: "Ada", text: "Greetings" }],
    });
    await act(async () => {
      await result.current.send("hi");
    });
    expect(transport.fetchVoiceConfig).toHaveBeenCalledTimes(1);
    expect(transport.send.mock.calls[0][0].voiceConfig).toEqual(voice);
  });

  it("reports a voice config that cannot be fetched", async () => {
    const { result, transport, log } = setup({
      bot: makeBot("Ada", null),
      history: [{ sender: "Ada", text: "Greetings" }],
    });
    transport.fetchVoiceConfig.mockRejectedValue(new Error("down"));
    await act(async () => {
      await result.current.send("hi");
    });
    expect(transport.send).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/Voice configuration missing/);
    expect(log).toHaveBeenCalledWith(
      "error",
      "voice_config_fetch_failed",
      expect.any(String),
      expect.anything(),
    );
  });
});
