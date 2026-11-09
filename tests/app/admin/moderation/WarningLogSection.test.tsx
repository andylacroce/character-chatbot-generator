import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { WarningLogSection } from "@/src/app/admin/moderation/WarningLogSection";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockFetch = jest.fn();
jest.mock("@/src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockFetch(...args),
}));

const res = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });
const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
const recent = {
  characterName: "elsa",
  displayName: "Elsa",
  reason: "Disney",
  createdAt: hoursAgo(1),
};
const old = {
  characterName: "batman",
  displayName: "Batman",
  reason: "DC",
  createdAt: hoursAgo(24 * 10),
};

describe("WarningLogSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockFetch.mockResolvedValue(res({ entries: [recent, old] }));
  });

  it("does not fetch until the session is authenticated", () => {
    mockUseSession.mockReturnValue({ status: "unauthenticated" });
    render(<WarningLogSection onChanged={jest.fn()} />);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("defaults to the last 24 hours and widens with the filter", async () => {
    render(<WarningLogSection onChanged={jest.fn()} />);
    expect(await screen.findByText("Elsa")).toBeInTheDocument();
    expect(screen.queryByText("Batman")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Filter by when flagged"), { target: { value: "0" } });
    expect(screen.getByText("Batman")).toBeInTheDocument();
    expect(screen.getByText("Recently warned (2)")).toBeInTheDocument();
  });

  it("shows an empty state when nothing is in the window", async () => {
    mockFetch.mockResolvedValue(res({ entries: [old] }));
    render(<WarningLogSection onChanged={jest.fn()} />);
    expect(await screen.findByText("No warnings in this window.")).toBeInTheDocument();
  });

  it.each([
    [403, "Not authorized."],
    [500, "Failed to load warnings."],
  ])("reports a %s load failure", async (status, message) => {
    mockFetch.mockResolvedValue(res({}, false, status));
    render(<WarningLogSection onChanged={jest.fn()} />);
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("reports a network failure", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    render(<WarningLogSection onChanged={jest.fn()} />);
    expect(await screen.findByText("Failed to load warnings.")).toBeInTheDocument();
  });

  it("sends a name to the blocklist, marks it actioned, and notifies siblings", async () => {
    const onChanged = jest.fn();
    render(<WarningLogSection onChanged={onChanged} />);
    await screen.findByText("Elsa");
    mockFetch.mockResolvedValue(res({ ok: true }));
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenLastCalledWith(
      "/api/admin/blocklist",
      expect.objectContaining({ method: "POST" }),
    );
    expect(screen.getByText("blocked")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Block" })).not.toBeInTheDocument();
  });

  it("leaves the row actionable when the server rejects the action", async () => {
    const onChanged = jest.fn();
    render(<WarningLogSection onChanged={onChanged} />);
    await screen.findByText("Elsa");
    mockFetch.mockResolvedValue(res({}, false, 500));
    fireEvent.click(screen.getByRole("button", { name: "Allow" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Allow" })).toBeEnabled());
    expect(onChanged).not.toHaveBeenCalled();
  });
});
