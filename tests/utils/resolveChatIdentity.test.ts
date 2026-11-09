import { resolveChatIdentity } from "../../src/utils/chat/chatContext";

jest.mock("../../src/utils/claude/anthropicClient", () => ({ __esModule: true, default: {} }));
const mockGetSessionUserId = jest.fn();
jest.mock("../../src/utils/account/getSessionUserId", () => ({
  getSessionUserId: (...a: unknown[]) => mockGetSessionUserId(...a),
}));
const mockLookupBot = jest.fn();
const mockLookupName = jest.fn();
jest.mock("../../src/utils/chat/chatPersistence", () => ({
  fetchUnsummarizedMessages: jest.fn(),
  lookupBot: (...a: unknown[]) => mockLookupBot(...a),
  lookupUserPreferredName: (...a: unknown[]) => mockLookupName(...a),
}));

const req = {} as never;

describe("resolveChatIdentity", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetSessionUserId.mockResolvedValue(null);
  });

  it("trusts the client for a guest, and never touches the database", async () => {
    const identity = await resolveChatIdentity(req, "Ada", "client personality", "Sam");
    expect(identity).toEqual({ botRow: null, personality: "client personality", userName: "Sam" });
    expect(mockLookupBot).not.toHaveBeenCalled();
    expect(mockLookupName).not.toHaveBeenCalled();
  });

  it("uses the server's saved personality and name for a signed-in user's character", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    const botRow = { personality: "saved personality" };
    mockLookupBot.mockResolvedValue(botRow);
    mockLookupName.mockResolvedValue("Stored Name");
    const identity = await resolveChatIdentity(req, "Ada", "spoofed", "Spoofed Name");
    expect(identity).toEqual({ botRow, personality: "saved personality", userName: "Stored Name" });
    expect(mockLookupBot).toHaveBeenCalledWith("user-1", "Ada");
  });

  it("falls back to the client's values for a signed-in user's unsaved character", async () => {
    mockGetSessionUserId.mockResolvedValue("user-1");
    mockLookupBot.mockResolvedValue(null);
    mockLookupName.mockResolvedValue(null);
    const identity = await resolveChatIdentity(req, "Ada", "client personality", "Sam");
    expect(identity).toEqual({ botRow: null, personality: "client personality", userName: "Sam" });
  });

  it("ignores a non-string client name", async () => {
    const identity = await resolveChatIdentity(req, "Ada", "p", 42);
    expect(identity.userName).toBe("");
  });
});
