import { renderHook, act, waitFor } from "@testing-library/react";
import { STORAGE_KEYS } from "../../../src/utils/storageKeys";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

jest.mock("../../../src/utils/storage", () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));
import storage from "../../../src/utils/storage";

jest.mock("../../../src/utils/logger", () => ({
  logEvent: jest.fn(),
  sanitizeLogMeta: (m: unknown) => m,
}));

import { useUserName } from "../../../app/components/useUserName";

describe("useUserName", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (storage.getItem as jest.Mock).mockReturnValue(null);
  });

  it("reads the guest name from localStorage on mount", () => {
    (storage.getItem as jest.Mock).mockReturnValue("Andy");
    mockUseSession.mockReturnValue({ status: "unauthenticated" });

    const { result } = renderHook(() => useUserName());

    expect(result.current.name).toBe("Andy");
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it("setName persists to localStorage for a guest, without hitting the server", () => {
    mockUseSession.mockReturnValue({ status: "unauthenticated" });
    const { result } = renderHook(() => useUserName());

    act(() => result.current.setName("Andy"));

    expect(result.current.name).toBe("Andy");
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.userName, "Andy");
    expect(mockAuthenticatedFetch).not.toHaveBeenCalled();
  });

  it("fetches /api/user-profile once signed in and adopts the server's stored name", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ json: async () => ({ name: "Ada Lovelace" }) });

    const { result } = renderHook(() => useUserName());

    await waitFor(() => expect(result.current.name).toBe("Ada Lovelace"));
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith("/api/user-profile");
  });

  it("seeds the server once from a pre-existing guest localStorage value when signed in with no stored name yet", async () => {
    (storage.getItem as jest.Mock).mockReturnValue("Andy");
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValueOnce({ json: async () => ({ name: null }) });
    mockAuthenticatedFetch.mockResolvedValueOnce({ json: async () => ({ persisted: true }) });

    renderHook(() => useUserName());

    await waitFor(() =>
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
        "/api/user-profile",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ name: "Andy" }),
        }),
      ),
    );
  });

  it("does not seed the server when there is no pre-existing guest name", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ json: async () => ({ name: null }) });

    renderHook(() => useUserName());

    await waitFor(() => expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1));
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith("/api/user-profile");
  });

  it("setName persists via POST /api/user-profile when signed in", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockResolvedValue({ json: async () => ({ name: null }) });
    const { result } = renderHook(() => useUserName());
    await waitFor(() => expect(mockAuthenticatedFetch).toHaveBeenCalledTimes(1));

    mockAuthenticatedFetch.mockResolvedValueOnce({ json: async () => ({ persisted: true }) });
    act(() => result.current.setName("Andy"));

    expect(result.current.name).toBe("Andy");
    expect(storage.setItem).toHaveBeenCalledWith(STORAGE_KEYS.userName, "Andy");
    await waitFor(() =>
      expect(mockAuthenticatedFetch).toHaveBeenLastCalledWith(
        "/api/user-profile",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Andy" }) }),
      ),
    );
  });

  it("does not crash when the initial fetch fails", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockAuthenticatedFetch.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useUserName());

    await waitFor(() => expect(mockAuthenticatedFetch).toHaveBeenCalled());
    expect(result.current.name).toBe("");
  });
});
