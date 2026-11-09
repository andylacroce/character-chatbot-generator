import { renderHook, waitFor, act } from "@testing-library/react";
import { useServerHistoryReconcile } from "../../../src/app/components/chat/useServerHistoryReconcile";
import { authenticatedFetch } from "../../../src/utils/api";

jest.mock("../../../src/utils/api");
let mockStatus = "unauthenticated";
jest.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: mockStatus }),
}));

const mockAuth = authenticatedFetch as jest.MockedFunction<typeof authenticatedFetch>;

describe("useServerHistoryReconcile", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockStatus = "unauthenticated";
  });

  it("is reconciled immediately for a guest, without calling the server", () => {
    const { result } = renderHook(() => useServerHistoryReconcile("Ada", jest.fn()));
    expect(result.current).toBe(true);
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it("waits while auth is loading", () => {
    mockStatus = "loading";
    const { result } = renderHook(() => useServerHistoryReconcile("Ada", jest.fn()));
    expect(result.current).toBe(false);
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it("adopts a longer server history, then reports reconciled", async () => {
    mockStatus = "authenticated";
    mockAuth.mockResolvedValue({
      json: async () => ({
        messages: [
          { sender: "User", text: "a" },
          { sender: "Ada", text: "b" },
        ],
      }),
    } as Response);
    const setMessages = jest.fn();
    const { result } = renderHook(() => useServerHistoryReconcile("Ada", setMessages));
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(mockAuth).toHaveBeenCalledWith("/api/messages?botName=Ada");
    const update = setMessages.mock.calls[0][0] as (m: unknown[]) => unknown[];
    expect(update([{ sender: "User", text: "a" }])).toHaveLength(2);
    expect(update([1, 2, 3])).toHaveLength(3);
  });

  it("still reconciles when the server call fails", async () => {
    mockStatus = "authenticated";
    mockAuth.mockRejectedValue(new Error("offline"));
    const setMessages = jest.fn();
    const { result } = renderHook(() => useServerHistoryReconcile("Ada", setMessages));
    await waitFor(() => expect(result.current).toBe(true));
    expect(setMessages).not.toHaveBeenCalled();
  });

  it("ignores a response that has no messages array", async () => {
    mockStatus = "authenticated";
    mockAuth.mockResolvedValue({ json: async () => ({}) } as Response);
    const setMessages = jest.fn();
    const { result } = renderHook(() => useServerHistoryReconcile("Ada", setMessages));
    await waitFor(() => expect(result.current).toBe(true));
    expect(setMessages).not.toHaveBeenCalled();
  });

  it("does not update state after unmount", async () => {
    mockStatus = "authenticated";
    let resolve!: (v: Response) => void;
    mockAuth.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    const setMessages = jest.fn();
    const { unmount } = renderHook(() => useServerHistoryReconcile("Ada", setMessages));
    unmount();
    await act(async () => {
      resolve({ json: async () => ({ messages: [{ sender: "User", text: "a" }] }) } as Response);
    });
    expect(setMessages).not.toHaveBeenCalled();
  });
});
