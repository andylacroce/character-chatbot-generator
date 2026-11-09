import { renderHook } from "@testing-library/react";
import {
  getStoredUserName,
  profileApiCall,
  safeFocus,
  useLogMessage,
} from "../../../src/app/components/chat/chatControllerHelpers";
import { authenticatedFetch } from "../../../src/utils/api";
import { logEvent } from "../../../src/utils/logger";
import storage from "../../../src/utils/storage";

jest.mock("../../../src/utils/api");
jest.mock("../../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

const mockAuth = authenticatedFetch as jest.MockedFunction<typeof authenticatedFetch>;
const mockLog = logEvent as jest.MockedFunction<typeof logEvent>;

describe("chatControllerHelpers", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storage.removeItem("chatbot-user-name");
  });

  describe("getStoredUserName", () => {
    it("returns undefined when no name is stored, and the name when one is", () => {
      expect(getStoredUserName()).toBeUndefined();
      storage.setItem("chatbot-user-name", "Ada");
      expect(getStoredUserName()).toBe("Ada");
    });
  });

  describe("safeFocus", () => {
    afterEach(() => jest.useRealTimers());

    it("focuses an attached input on the next tick", () => {
      jest.useFakeTimers();
      const input = document.createElement("input");
      document.body.appendChild(input);
      const focus = jest.spyOn(input, "focus");
      safeFocus({ current: input });
      expect(focus).not.toHaveBeenCalled();
      jest.runAllTimers();
      expect(focus).toHaveBeenCalled();
      input.remove();
    });

    it("does nothing for a null or detached input", () => {
      jest.useFakeTimers();
      const detached = document.createElement("input");
      const focus = jest.spyOn(detached, "focus");
      safeFocus({ current: null });
      safeFocus({ current: detached });
      jest.runAllTimers();
      expect(focus).not.toHaveBeenCalled();
    });
  });

  describe("profileApiCall", () => {
    it("returns the result and logs the timing outside production", async () => {
      await expect(profileApiCall("Label", async () => 42)).resolves.toBe(42);
      expect(mockLog).toHaveBeenCalledWith(
        "info",
        "chat_api_timing",
        "Label completed",
        expect.objectContaining({ operation: "Label" }),
      );
    });

    it("still logs and rethrows when the call fails", async () => {
      await expect(
        profileApiCall("Bad", async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(mockLog).toHaveBeenCalledWith(
        "info",
        "chat_api_timing",
        "Bad completed",
        expect.anything(),
      );
    });
  });

  describe("useLogMessage", () => {
    const message = { sender: "User", text: "hi" };

    it("posts the message with the session ids", async () => {
      mockAuth.mockResolvedValue({ ok: true } as Response);
      const { result } = renderHook(() => useLogMessage("sid", "2026-01-01"));
      await result.current(message);
      const [url, init] = mockAuth.mock.calls[0];
      expect(url).toBe("/api/log-message");
      expect(JSON.parse(String(init?.body))).toEqual({
        sender: "User",
        text: "hi",
        sessionId: "sid",
        sessionDatetime: "2026-01-01",
      });
    });

    it("does nothing without a session", async () => {
      const { result } = renderHook(() => useLogMessage("", ""));
      await result.current(message);
      expect(mockAuth).not.toHaveBeenCalled();
    });

    it("warns instead of throwing when the server rejects the log", async () => {
      mockAuth.mockResolvedValue({ ok: false } as Response);
      const { result } = renderHook(() => useLogMessage("sid", "2026-01-01"));
      await expect(result.current(message)).resolves.toBeUndefined();
      expect(mockLog).toHaveBeenCalledWith(
        "warn",
        "client_log_message_failed",
        expect.any(String),
        expect.objectContaining({ sender: "User" }),
      );
    });
  });
});
