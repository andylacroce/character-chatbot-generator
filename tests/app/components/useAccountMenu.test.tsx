import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import { useAccountMenu } from "../../../src/app/components/account/useAccountMenu";
import { mockResponse } from "../../helpers/mockResponse";

let mockStatus = "authenticated";
const mockSignOut = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => ({
    data: mockStatus === "authenticated" ? { user: { name: "Ada" } } : null,
    status: mockStatus,
  }),
  getProviders: () => Promise.resolve({ google: {} }),
  signOut: (...a: unknown[]) => mockSignOut(...a),
}));

const mockFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...a: unknown[]) => mockFetch(...a),
}));

jest.mock("../../../src/app/components/account/useUserName", () => ({
  useUserName: () => ({ name: "", setName: jest.fn() }),
}));
jest.mock("../../../src/app/components/account/AuthControl", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../../../src/app/components/account/NameCaptureModal", () => ({
  NameCaptureModal: () => null,
}));
jest.mock("../../../src/app/components/account/SignInModal", () => ({
  __esModule: true,
  default: () => null,
}));
// Expose onConfirm so the delete flow can be driven without the real dialog's chrome.
jest.mock("../../../src/app/components/common/ConfirmDialog", () => ({
  __esModule: true,
  default: ({ onConfirm }: { onConfirm: () => Promise<void> }) => (
    <button onClick={() => onConfirm().catch(() => {})}>confirm-delete</button>
  ),
}));

// Awaited so getProviders()' state update lands inside act.
async function renderHarness() {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Harness />);
  });
  return result;
}

function Harness() {
  const { menuItems, modals } = useAccountMenu();
  return (
    <>
      {menuItems}
      {modals}
    </>
  );
}

describe("useAccountMenu", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = "authenticated";
    localStorage.clear();
  });

  it("shows the admin links only when is-admin reports true", async () => {
    mockFetch.mockResolvedValue(mockResponse({ isAdmin: true }));
    await renderHarness();

    expect(await screen.findByText("Moderation")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
  });

  it("fails closed when the admin check errors, and skips it for guests", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    const { unmount } = await renderHarness();
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(screen.queryByText("Stats")).not.toBeInTheDocument();
    unmount();

    mockFetch.mockClear();
    mockStatus = "unauthenticated";
    await renderHarness();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByText("Guest")).toBeInTheDocument();
    expect(screen.queryByText("Delete account")).not.toBeInTheDocument();
  });

  it("deletes server-side first, then clears personal local data and signs out", async () => {
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve(url === "/api/account" ? mockResponse({}) : mockResponse({ isAdmin: false })),
    );
    localStorage.setItem("unrelated", "keep");
    await renderHarness();

    await act(async () => {
      screen.getByText("confirm-delete").click();
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/account", { method: "DELETE" });
    expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/" });
    expect(localStorage.getItem("unrelated")).toBe("keep");
  });

  it("keeps local data and stays signed in when the server refuses deletion", async () => {
    mockFetch.mockImplementation((url: string) =>
      Promise.resolve(
        url === "/api/account" ? mockResponse({}, 500) : mockResponse({ isAdmin: false }),
      ),
    );
    await renderHarness();

    await act(async () => {
      screen.getByText("confirm-delete").click();
    });

    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
