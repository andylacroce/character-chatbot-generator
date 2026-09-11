import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AdminActivityChart from "@/app/components/AdminActivityChart";

describe("AdminActivityChart", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-11T12:00:00Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("shows an empty state when there's no activity in range", () => {
    render(<AdminActivityChart data={[]} />);
    expect(screen.getByText("No activity recorded in this range yet.")).toBeInTheDocument();
  });

  it("always renders a legend naming every series", () => {
    const { container } = render(
      <AdminActivityChart
        data={[{ day: "2026-09-10", validated: 4, created: 2, avatarGenerated: 2 }]}
      />,
    );
    const legend = container.querySelector(".legend") as HTMLElement;
    expect(within(legend).getByText("Names validated")).toBeInTheDocument();
    expect(within(legend).getByText("Characters created")).toBeInTheDocument();
    expect(within(legend).getByText("Avatars generated")).toBeInTheDocument();
  });

  it("defaults to the 30-day range and switches range on click", () => {
    render(
      <AdminActivityChart
        data={[{ day: "2026-09-10", validated: 4, created: 2, avatarGenerated: 2 }]}
      />,
    );
    const group = screen.getByRole("group", { name: "Date range" });
    expect(within(group).getByText("30d")).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByText("7d")).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(within(group).getByText("7d"));
    expect(within(group).getByText("7d")).toHaveAttribute("aria-pressed", "true");
    expect(within(group).getByText("30d")).toHaveAttribute("aria-pressed", "false");
  });

  it("shows a tooltip with per-series values on hover/focus of a day", () => {
    render(
      <AdminActivityChart
        data={[{ day: "2026-09-10", validated: 4, created: 2, avatarGenerated: 2 }]}
      />,
    );
    const point = screen.getByLabelText("Sep 10: 4 validated, 2 created, 2 avatars generated");
    fireEvent.focus(point);
    expect(screen.getByText("Sep 10")).toBeInTheDocument();
    // Tooltip renders each series' label + value alongside the legend copy.
    expect(screen.getAllByText("Names validated").length).toBeGreaterThan(1);

    fireEvent.blur(point);
    expect(screen.queryByText("Sep 10")).not.toBeInTheDocument();
  });

  it("carries the same values in a collapsible table view", () => {
    render(
      <AdminActivityChart
        data={[{ day: "2026-09-10", validated: 4, created: 2, avatarGenerated: 2 }]}
      />,
    );
    expect(screen.getByText("View as table")).toBeInTheDocument();
    expect(screen.getByText("2026-09-10")).toBeInTheDocument();
  });
});
