import { act, render, renderHook, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";

jest.mock("../src/auth", () => ({
  getMobileSession: jest.fn(),
  loadAuthToken: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));

import { getMobileSession, loadAuthToken, signIn, signOut } from "../src/auth";
import { AuthProvider, useAuth } from "../src/AuthContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthContext", () => {
  it("starts signed out when no token is persisted", async () => {
    (loadAuthToken as jest.Mock).mockResolvedValue(null);
    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("signedOut"));
  });

  it("resolves signed-in identity when a token exists", async () => {
    (loadAuthToken as jest.Mock).mockResolvedValue("tok");
    (getMobileSession as jest.Mock).mockResolvedValue({
      userId: "u1",
      email: "andy@example.com",
      name: "Andy",
    });

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("signedIn"));
    expect(result.current.email).toBe("andy@example.com");
    expect(result.current.name).toBe("Andy");
  });

  it("treats a session with no userId as signed out", async () => {
    (loadAuthToken as jest.Mock).mockResolvedValue("tok");
    (getMobileSession as jest.Mock).mockResolvedValue({ userId: null, email: null, name: null });

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("signedOut"));
  });

  it("keeps loading->signedOut on a transient session-fetch failure", async () => {
    (loadAuthToken as jest.Mock).mockResolvedValue("tok");
    (getMobileSession as jest.Mock).mockRejectedValue(new Error("network down"));

    const { result } = await renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("signedOut"));
  });

  it("signIn() re-resolves identity on success", async () => {
    (loadAuthToken as jest.Mock).mockResolvedValueOnce(null);
    (signIn as jest.Mock).mockResolvedValue({ ok: true });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    (loadAuthToken as jest.Mock).mockResolvedValue("new-tok");
    (getMobileSession as jest.Mock).mockResolvedValue({
      userId: "u1",
      email: "andy@example.com",
      name: "Andy",
    });

    await act(async () => {
      await result.current.signIn();
    });

    expect(result.current.status).toBe("signedIn");
  });

  it("signIn() keeps an already-signed-in user signed in if the identity refresh fails", async () => {
    (loadAuthToken as jest.Mock).mockResolvedValue("tok");
    (getMobileSession as jest.Mock).mockResolvedValueOnce({
      userId: "u1",
      email: "andy@example.com",
      name: "Andy",
    });
    (signIn as jest.Mock).mockResolvedValue({ ok: true });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));

    (getMobileSession as jest.Mock).mockRejectedValueOnce(new Error("network blip"));
    await act(async () => {
      await result.current.signIn();
    });

    expect(result.current.status).toBe("signedIn");
    expect(result.current.name).toBe("Andy");
  });

  it("signIn() lands signed out if no token was actually persisted", async () => {
    (loadAuthToken as jest.Mock).mockResolvedValue(null);
    (signIn as jest.Mock).mockResolvedValue({ ok: true });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    await act(async () => {
      await result.current.signIn();
    });

    expect(getMobileSession).not.toHaveBeenCalled();
    expect(result.current.status).toBe("signedOut");
    expect(result.current.email).toBeNull();
  });

  it("signIn() does not re-resolve identity when the flow is cancelled", async () => {
    (loadAuthToken as jest.Mock).mockResolvedValue(null);
    (signIn as jest.Mock).mockResolvedValue({ ok: false, error: "cancelled" });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    await act(async () => {
      await result.current.signIn();
    });

    expect(getMobileSession).not.toHaveBeenCalled();
    expect(result.current.status).toBe("signedOut");
  });

  it("signOut() clears identity and returns to signed-out", async () => {
    (loadAuthToken as jest.Mock).mockResolvedValue("tok");
    (getMobileSession as jest.Mock).mockResolvedValue({
      userId: "u1",
      email: "andy@example.com",
      name: "Andy",
    });
    (signOut as jest.Mock).mockResolvedValue(undefined);

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.status).toBe("signedOut");
    expect(result.current.email).toBeNull();
    expect(result.current.name).toBeNull();
  });

  it("useAuth() outside a provider returns the safe default context", async () => {
    function Consumer() {
      const auth = useAuth();
      return <Text>{auth.status}</Text>;
    }
    const { getByText } = await render(<Consumer />);
    expect(getByText("loading")).toBeTruthy();
  });
});
