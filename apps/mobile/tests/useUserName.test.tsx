import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { STORAGE_KEYS } from "character-chatbot-shared";

jest.mock("../src/api", () => ({
  getUserProfile: jest.fn(),
  saveUserProfile: jest.fn(),
}));
jest.mock("../src/AuthContext", () => ({
  useAuth: jest.fn(),
}));

import { getUserProfile, saveUserProfile } from "../src/api";
import { useAuth } from "../src/AuthContext";
import { loadUserName, saveUserName, saveUserNameGateSkipped } from "../src/storage";
import { useUserName } from "../src/useUserName";

const mockedUseAuth = useAuth as jest.Mock;

describe("useUserName", () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    mockedUseAuth.mockReturnValue({ status: "signedOut" });
  });

  it("resolves as a guest from AsyncStorage with no name set", async () => {
    const { result } = await renderHook(() => useUserName());

    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.name).toBe("");
    expect(result.current.hasSkippedGate).toBe(false);
  });

  it("loads a previously saved guest name", async () => {
    await saveUserName("Andy");
    const { result } = await renderHook(() => useUserName());

    await waitFor(() => expect(result.current.name).toBe("Andy"));
  });

  it("loads whether the name-capture gate was previously skipped", async () => {
    await saveUserNameGateSkipped();
    const { result } = await renderHook(() => useUserName());

    await waitFor(() => expect(result.current.hasSkippedGate).toBe(true));
  });

  it("does not resolve until the signed-in profile fetch settles", async () => {
    mockedUseAuth.mockReturnValue({ status: "signedIn" });
    let resolveProfile: (value: { name: string | null }) => void = () => {};
    (getUserProfile as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );

    const { result } = await renderHook(() => useUserName());
    expect(result.current.isResolved).toBe(false);

    await act(async () => {
      resolveProfile({ name: "Jane" });
    });

    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.name).toBe("Jane");
  });

  it("seeds the server once from a guest-entered name on first sign-in with none saved", async () => {
    await saveUserName("Andy");
    mockedUseAuth.mockReturnValue({ status: "signedIn" });
    (getUserProfile as jest.Mock).mockResolvedValue({ name: null });
    (saveUserProfile as jest.Mock).mockResolvedValue({ persisted: true });

    await renderHook(() => useUserName());

    await waitFor(() => expect(saveUserProfile).toHaveBeenCalledWith("Andy"));
  });

  it("does not seed the server when signed in with no local guest name either", async () => {
    mockedUseAuth.mockReturnValue({ status: "signedIn" });
    (getUserProfile as jest.Mock).mockResolvedValue({ name: null });

    const { result } = await renderHook(() => useUserName());
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    expect(saveUserProfile).not.toHaveBeenCalled();
  });

  it("stays resolved with the local value when the profile fetch fails", async () => {
    await saveUserName("Andy");
    mockedUseAuth.mockReturnValue({ status: "signedIn" });
    (getUserProfile as jest.Mock).mockRejectedValue(new Error("network down"));

    const { result } = await renderHook(() => useUserName());

    await waitFor(() => expect(result.current.isResolved).toBe(true));
    expect(result.current.name).toBe("Andy");
  });

  it("setName updates local state, storage, and the server when signed in", async () => {
    mockedUseAuth.mockReturnValue({ status: "signedIn" });
    (getUserProfile as jest.Mock).mockResolvedValue({ name: "Andy" });
    (saveUserProfile as jest.Mock).mockResolvedValue({ persisted: true });

    const { result } = await renderHook(() => useUserName());
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    await act(() => {
      result.current.setName("New Name");
    });

    expect(result.current.name).toBe("New Name");
    await waitFor(() => expect(saveUserProfile).toHaveBeenCalledWith("New Name"));
    await expect(loadUserName()).resolves.toBe("New Name");
  });

  it("setName does not call the server for a guest", async () => {
    const { result } = await renderHook(() => useUserName());
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    await act(() => {
      result.current.setName("Guest Name");
    });

    expect(saveUserProfile).not.toHaveBeenCalled();
  });

  it("markGateSkipped persists the skip flag", async () => {
    const { result } = await renderHook(() => useUserName());
    await waitFor(() => expect(result.current.isResolved).toBe(true));

    await act(() => {
      result.current.markGateSkipped();
    });

    expect(result.current.hasSkippedGate).toBe(true);
    await expect(AsyncStorage.getItem(STORAGE_KEYS.userNameGateSkipped)).resolves.toBe("1");
  });
});
