import { downloadChatTranscript } from "../../../src/app/components/chat/chatTranscript";
import { downloadTranscript } from "../../../src/utils/chat/downloadTranscript";
import { logEvent } from "../../../src/utils/logger";

jest.mock("../../../src/utils/chat/downloadTranscript");
jest.mock("../../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

const mockDownload = downloadTranscript as jest.MockedFunction<typeof downloadTranscript>;
const mockLog = logEvent as jest.MockedFunction<typeof logEvent>;
const bot = { name: "Ada", avatarUrl: "a.png" } as Parameters<typeof downloadChatTranscript>[1];
const messages = [{ sender: "User", text: "hi" }];

describe("downloadChatTranscript", () => {
  beforeEach(() => jest.clearAllMocks());

  it("downloads with the bot's name and avatar and logs success", async () => {
    mockDownload.mockResolvedValue(undefined);
    await downloadChatTranscript(messages, bot, "Sam");
    expect(mockDownload).toHaveBeenCalledWith(messages, { name: "Ada", avatarUrl: "a.png" }, "Sam");
    expect(mockLog).toHaveBeenCalledWith(
      "info",
      "chat_transcript_downloaded",
      expect.any(String),
      expect.objectContaining({ botName: "Ada", messageCount: 1 }),
    );
  });

  it("logs and alerts when the download fails", async () => {
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    mockDownload.mockRejectedValue(new Error("blocked"));
    await downloadChatTranscript(messages, bot);
    expect(mockLog).toHaveBeenCalledWith(
      "error",
      "chat_transcript_download_failed",
      expect.any(String),
      expect.objectContaining({ error: "blocked" }),
    );
    expect(alertSpy).toHaveBeenCalledWith("Failed to open transcript: blocked");
    alertSpy.mockRestore();
  });

  it("reports a generic message for a non-Error rejection", async () => {
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    mockDownload.mockRejectedValue("nope");
    await downloadChatTranscript(messages, bot);
    expect(alertSpy).toHaveBeenCalledWith("Failed to open transcript: Unknown error occurred");
    alertSpy.mockRestore();
  });
});
