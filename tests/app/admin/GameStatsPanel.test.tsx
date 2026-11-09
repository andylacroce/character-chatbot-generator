import React from "react";
import { render, screen } from "@testing-library/react";
import { GameStatsPanel } from "@/src/app/admin/GameStatsPanel";
import { FULL_STATS } from "../../helpers/adminStatsFixture";

describe("GameStatsPanel", () => {
  it("renders as the game tab panel with derived game figures", () => {
    render(<GameStatsPanel stats={FULL_STATS} />);
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "game-stats-panel");
    expect(panel).toHaveAttribute("aria-labelledby", "game-stats-tab");
    expect(panel).toHaveTextContent("60%");
  });

  it("shows an em dash instead of NaN when there is nothing to divide", () => {
    const stats = {
      ...FULL_STATS,
      game: { ...FULL_STATS.game, guessAccuracyPct: null, continuationPct: null, guestPct: null },
    };
    render(<GameStatsPanel stats={stats} />);
    expect(screen.getByRole("tabpanel")).not.toHaveTextContent("NaN");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("—");
  });
});
