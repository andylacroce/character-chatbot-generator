import React from "react";
import { render, screen } from "@testing-library/react";
import { CharacterStatsPanel } from "@/src/app/admin/CharacterStatsPanel";
import { FULL_STATS } from "../../helpers/adminStatsFixture";

describe("CharacterStatsPanel", () => {
  it("renders as the character tab panel with labeled breakdowns", () => {
    render(<CharacterStatsPanel stats={FULL_STATS} />);
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "character-stats-panel");
    expect(panel).toHaveAttribute("aria-labelledby", "character-stats-tab");
    expect(panel).toHaveTextContent("Reused from cache");
    expect(panel).toHaveTextContent("Caution (possible trademark)");
    expect(screen.getByText("Character Wall catalog (all time)")).toBeInTheDocument();
    expect(screen.getByText("Historical Figures")).toBeInTheDocument();
    expect(screen.getByText("Mythology")).toBeInTheDocument();
    expect(
      screen.getByText(/came from the cache instead of a new image generation/),
    ).toBeInTheDocument();
  });
});
