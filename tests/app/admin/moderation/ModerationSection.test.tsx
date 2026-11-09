import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ModerationSection } from "@/src/app/admin/moderation/ModerationSection";

const mockUseSession = jest.fn();
jest.mock("next-auth/react", () => ({
  useSession: () => mockUseSession(),
}));

const mockFetch = jest.fn();
jest.mock("@/src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockFetch(...args),
}));

const res = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body });
const entry = {
  characterName: "mickey mouse",
  displayName: "Mickey Mouse",
  reason: "trademark",
  source: "admin",
  createdAt: new Date().toISOString(),
};

function setup(onChanged = jest.fn()) {
  render(
    <ModerationSection
      title="Blocked"
      hint="hint"
      apiPath="/api/admin/blocklist"
      namePlaceholder="Character name to block"
      addButtonLabel="Block"
      removeButtonLabel="Unblock"
      emptyMessage="No blocked names."
      transferTo={{ apiPath: "/api/admin/allowlist", label: "Move to Allowed" }}
      refreshKey={0}
      onChanged={onChanged}
    />,
  );
  return onChanged;
}

describe("ModerationSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({ status: "authenticated" });
    mockFetch.mockResolvedValue(res({ entries: [entry] }));
  });

  it("does not fetch until the session is authenticated", () => {
    mockUseSession.mockReturnValue({ status: "loading" });
    setup();
    expect(mockFetch).not.toHaveBeenCalled();
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("lists entries with a count in the title", async () => {
    setup();
    expect(await screen.findByText("Mickey Mouse")).toBeInTheDocument();
    expect(screen.getByText("Blocked (1)")).toBeInTheDocument();
  });

  it("shows the empty message when the list is empty", async () => {
    mockFetch.mockResolvedValue(res({ entries: [] }));
    setup();
    expect(await screen.findByText("No blocked names.")).toBeInTheDocument();
  });

  it.each([
    [403, "Not authorized."],
    [500, "Failed to load."],
  ])("reports a %s load failure", async (status, message) => {
    mockFetch.mockResolvedValue(res({}, false, status));
    setup();
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it("reports a network failure on load", async () => {
    mockFetch.mockRejectedValue(new Error("offline"));
    setup();
    expect(await screen.findByText("Failed to load.")).toBeInTheDocument();
  });

  it("keeps the add button disabled until a name is typed", async () => {
    setup();
    await screen.findByText("Mickey Mouse");
    expect(screen.getByRole("button", { name: "Block" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Character name to block"), {
      target: { value: "Hitler" },
    });
    expect(screen.getByRole("button", { name: "Block" })).toBeEnabled();
  });

  it("shows an error and does not notify siblings when adding fails", async () => {
    const onChanged = setup();
    await screen.findByText("Mickey Mouse");
    mockFetch.mockResolvedValue(res({}, false, 500));
    fireEvent.change(screen.getByLabelText("Character name to block"), {
      target: { value: "Someone" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Block" }));
    expect(await screen.findByText("Failed to add that name.")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("shows an error when removing throws", async () => {
    setup();
    await screen.findByText("Mickey Mouse");
    mockFetch.mockRejectedValue(new Error("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    expect(await screen.findByText("Failed to remove that name.")).toBeInTheDocument();
  });

  it("names the failed transfer in its error", async () => {
    setup();
    await screen.findByText("Mickey Mouse");
    mockFetch.mockResolvedValue(res({}, false, 500));
    fireEvent.click(screen.getByRole("button", { name: "Move to Allowed" }));
    expect(await screen.findByText("Failed to move to allowed.")).toBeInTheDocument();
  });

  it("refetches and notifies siblings after a successful removal", async () => {
    const onChanged = setup();
    await screen.findByText("Mickey Mouse");
    mockFetch.mockResolvedValue(res({ entries: [] }));
    fireEvent.click(screen.getByRole("button", { name: "Unblock" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/blocklist",
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});
