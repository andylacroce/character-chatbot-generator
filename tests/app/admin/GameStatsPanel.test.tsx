import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameStatsPanel } from "@/src/app/admin/GameStatsPanel";
import { FULL_STATS } from "../../helpers/adminStatsFixture";

describe("GameStatsPanel", () => {
  it("renders as the game tab panel with derived game figures", () => {
    render(<GameStatsPanel stats={FULL_STATS} />);
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "game-stats-panel");
    expect(panel).toHaveAttribute("aria-labelledby", "game-stats-tab");
    expect(panel).toHaveTextContent("75%");
  });

  it("switches between the two games with accurate descriptions", () => {
    render(<GameStatsPanel stats={FULL_STATS} />);
    expect(screen.getByText(/mystery character that drops clues/)).toBeInTheDocument();
    expect(screen.queryByText("Correct guesses followed by another round")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Guess Who's Next/ }));
    expect(screen.getByText(/steers toward a different, hidden figure/)).toBeInTheDocument();
    expect(screen.getByText("Correct guesses followed by another round")).toBeInTheDocument();
  });

  it("shows an em dash instead of NaN when there is nothing to divide", () => {
    const stats = {
      ...FULL_STATS,
      guessWho: { ...FULL_STATS.guessWho, guessAccuracyPct: null, guestPct: null },
    };
    render(<GameStatsPanel stats={stats} />);
    expect(screen.getByRole("tabpanel")).not.toHaveTextContent("NaN");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("—");
  });
});
