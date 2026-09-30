import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LeaderboardPage from "../../../src/app/components/LeaderboardPage";

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush, back: mockBack }) }));

jest.mock("../../../src/app/components/useAccountMenu", () => ({
  useAccountMenu: () => ({ menuItems: null, modals: null }),
}));

const mockAuthenticatedFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockAuthenticatedFetch(...(args as unknown[])),
}));

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

describe("LeaderboardPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthenticatedFetch.mockImplementation((url: string) => {
      if (url === "/api/guess-who/leaderboard")
        return Promise.resolve(
          jsonResponse({ entries: [{ rank: 1, name: "Cleopatra Fan", streak: 6 }] }),
        );
      if (url === "/api/guess-who-next/leaderboard")
        return Promise.resolve(jsonResponse({ entries: [{ rank: 1, name: "Ada", streak: 9 }] }));
      if (url === "/api/guess-who/leaderboard-settings")
        return Promise.resolve(
          jsonResponse({ available: false, showOnLeaderboard: false, eligible: false, name: null }),
        );
      if (url === "/api/guess-who-next/leaderboard-settings")
        return Promise.resolve(
          jsonResponse({ available: false, showOnLeaderboard: false, eligible: false, name: null }),
        );
      return Promise.resolve(jsonResponse({}));
    });
  });

  it("shows the Guess Who tab first, active by default, with its own entries", async () => {
    render(<LeaderboardPage />);
    expect(await screen.findByText("Cleopatra Fan")).toBeInTheDocument();
    expect(screen.getByTestId("leaderboard-tab-guess-who")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(mockAuthenticatedFetch).toHaveBeenCalledWith("/api/guess-who/leaderboard");
  });

  it("switches to the Guess Who's Next tab and loads its own entries", async () => {
    render(<LeaderboardPage />);
    await screen.findByText("Cleopatra Fan");
    fireEvent.click(screen.getByTestId("leaderboard-tab-guess-who-next"));
    expect(await screen.findByText("Ada")).toBeInTheDocument();
    expect(screen.queryByText("Cleopatra Fan")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockAuthenticatedFetch).toHaveBeenCalledWith("/api/guess-who-next/leaderboard"),
    );
  });

  it("the play link points at the active tab's game", async () => {
    render(<LeaderboardPage />);
    await screen.findByText("Cleopatra Fan");
    expect(screen.getByText("Play Guess Who").closest("a")).toHaveAttribute("href", "/guess-who");
    fireEvent.click(screen.getByTestId("leaderboard-tab-guess-who-next"));
    await screen.findByText("Ada");
    expect(screen.getByText("Play Guess Who's Next").closest("a")).toHaveAttribute(
      "href",
      "/guess-who-next",
    );
  });
});
