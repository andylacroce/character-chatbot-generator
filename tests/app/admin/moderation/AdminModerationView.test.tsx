import React from "react";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import AdminModerationView from "@/src/app/admin/moderation/AdminModerationView";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
  getProviders: () => Promise.resolve({}),
}));

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const mockAuthenticatedFetch = jest.fn();
jest.mock("@/src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...args),
}));

/** Routes each authenticatedFetch call by URL/method to canned responses, defaulting to empty lists. */
function setupFetch(overrides: Record<string, unknown> = {}) {
  mockAuthenticatedFetch.mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const key = `${method} ${url}`;
    if (key in overrides) return Promise.resolve(overrides[key]);
    if (url === "/api/admin/warnings") return Promise.resolve(jsonResponse({ entries: [] }));
    if (url === "/api/admin/allowlist" && method === "GET")
      return Promise.resolve(jsonResponse({ entries: [] }));
    if (url === "/api/admin/blocklist" && method === "GET")
      return Promise.resolve(jsonResponse({ entries: [] }));
    if (method === "POST" || method === "DELETE")
      return Promise.resolve(jsonResponse({ ok: true }));
    return Promise.resolve(jsonResponse({}));
  });
}

describe("AdminModerationView", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupFetch();
  });

  it("shows a not-signed-in message for a guest", () => {
    mockUseSession.mockReturnValue({ status: "unauthenticated" });
    render(<AdminModerationView />);
    expect(screen.getByText("Not signed in.")).toBeInTheDocument();
  });

  it("renders all three sections for a signed-in admin", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    render(<AdminModerationView />);
    await waitFor(() => expect(screen.getByText(/Recently warned/)).toBeInTheDocument());
    expect(screen.getByText(/^Allowed/)).toBeInTheDocument();
    expect(screen.getByText(/^Blocked/)).toBeInTheDocument();
  });

  it("shows empty-state messages for each list", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    render(<AdminModerationView />);
    await waitFor(() =>
      expect(screen.getByText("No warnings in this window.")).toBeInTheDocument(),
    );
    expect(screen.getByText("No manually-allowed names.")).toBeInTheDocument();
    expect(screen.getByText("No blocked names.")).toBeInTheDocument();
  });

  it("adds a name to the allowlist and refreshes both lists", async () => {
    mockUseSession.mockReturnValue({ status: "authenticated" });
    render(<AdminModerationView />);
    await waitFor(() => expect(screen.getByText("No manually-allowed names.")).toBeInTheDocument());

    const callsBefore = mockAuthenticatedFetch.mock.calls.length;
    fireEvent.change(screen.getByLabelText("Character name to allow"), {
      target: { value: "Alice Munro" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    });

    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      "/api/admin/allowlist",
      expect.objectContaining({ method: "POST" }),
    );
    // A successful add bumps refreshKey, which re-triggers every section's fetch —
    // more calls should have gone out than just the one POST.
    await waitFor(() =>
      expect(mockAuthenticatedFetch.mock.calls.length).toBeGreaterThan(callsBefore + 1),
    );
  });

  it("removes a blocked name via the Unblock action", async () => {
    setupFetch({
      "GET /api/admin/blocklist": jsonResponse({
        entries: [
          {
            characterName: "elsa",
            displayName: "Elsa",
            reason: "Disney trademark",
            source: "claude",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
    mockUseSession.mockReturnValue({ status: "authenticated" });
    render(<AdminModerationView />);
    await waitFor(() => expect(screen.getByText("Elsa")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    });

    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      "/api/admin/blocklist",
      expect.objectContaining({ method: "DELETE", body: JSON.stringify({ name: "elsa" }) }),
    );
  });

  it("transfers an allowed name to the blocklist via 'Move to Blocked'", async () => {
    setupFetch({
      "GET /api/admin/allowlist": jsonResponse({
        entries: [
          {
            characterName: "elsa",
            displayName: "Elsa",
            reason: null,
            source: "admin",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
    mockUseSession.mockReturnValue({ status: "authenticated" });
    render(<AdminModerationView />);
    await waitFor(() => expect(screen.getByText("Elsa")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Move to Blocked" }));
    });

    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      "/api/admin/blocklist",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "elsa" }) }),
    );
  });

  it("filters the warning log by time window", async () => {
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    setupFetch({
      "GET /api/admin/warnings": jsonResponse({
        entries: [
          { characterName: "elsa", displayName: "Elsa", reason: "Disney", createdAt: oldDate },
        ],
      }),
    });
    mockUseSession.mockReturnValue({ status: "authenticated" });
    render(<AdminModerationView />);

    // Default window is "Last 24 hours" — a 40-day-old entry should be filtered out.
    await waitFor(() =>
      expect(screen.getByText("No warnings in this window.")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Filter by when flagged"), {
      target: { value: "0" }, // "All time"
    });
    await waitFor(() => expect(screen.getByText("Elsa")).toBeInTheDocument());
  });

  it("actions a warning log entry to Allow and marks it actioned", async () => {
    setupFetch({
      "GET /api/admin/warnings": jsonResponse({
        entries: [
          {
            characterName: "elsa",
            displayName: "Elsa",
            reason: "Disney",
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
    mockUseSession.mockReturnValue({ status: "authenticated" });
    render(<AdminModerationView />);
    await waitFor(() => expect(screen.getByText("Elsa")).toBeInTheDocument());

    // Disambiguated from the "Allowed" section's own add-form submit button (also
    // named "Allow") via the quick-action's title attribute.
    await act(async () => {
      fireEvent.click(screen.getByTitle("Allow"));
    });

    expect(mockAuthenticatedFetch).toHaveBeenCalledWith(
      "/api/admin/allowlist",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "elsa" }) }),
    );
    await waitFor(() => expect(screen.getByText("allowed")).toBeInTheDocument());
  });
});
