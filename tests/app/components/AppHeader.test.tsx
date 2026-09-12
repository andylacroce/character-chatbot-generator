import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import AppHeader from "@/app/components/AppHeader";

describe("AppHeader", () => {
  it("renders the center content and menu items inside the hamburger dropdown", () => {
    render(
      <AppHeader
        menuItems={<button aria-label="Do a thing">Do a thing</button>}
        center={<div>Center content</div>}
      />,
    );
    expect(screen.getByText("Center content")).toBeInTheDocument();
    expect(screen.queryByLabelText("Do a thing")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByLabelText("Do a thing")).toBeInTheDocument();
  });

  it("renders extra content opposite the hamburger by default (menuSide left)", () => {
    render(
      <AppHeader
        menuItems={<button>Item</button>}
        center={<div>Center</div>}
        extra={<div>Extra content</div>}
      />,
    );
    expect(screen.getByText("Extra content")).toBeInTheDocument();
  });

  it("uses a custom trigger and its aria-label when provided", () => {
    render(
      <AppHeader
        menuItems={<button>Item</button>}
        center={<div>Center</div>}
        menuTrigger={<span>Guest</span>}
        menuTriggerAriaLabel="Account: Guest. Open menu"
      />,
    );
    expect(screen.getByLabelText("Account: Guest. Open menu")).toHaveTextContent("Guest");
  });

  it("swaps the hamburger to the right side when menuSide is right", () => {
    const { container } = render(
      <AppHeader
        menuItems={<button>Item</button>}
        center={<div>Center</div>}
        extra={<div>Extra content</div>}
        menuSide="right"
      />,
    );
    const menuButton = screen.getByLabelText("Open menu");
    const headerRight = container.querySelector('[class*="headerRight"]');
    const headerLeft = container.querySelector('[class*="headerLeft"]');
    expect(headerRight?.contains(menuButton)).toBe(true);
    expect(headerLeft?.textContent).toContain("Extra content");
  });
});
