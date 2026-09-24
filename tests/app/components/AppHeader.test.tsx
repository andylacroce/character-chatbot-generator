import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import AppHeader from "@/src/app/components/AppHeader";

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

  it("renders the dark-mode toggle as its own header control, not folded into the hamburger dropdown", () => {
    render(<AppHeader menuItems={<button>Item</button>} center={<div>Center</div>} />);
    expect(screen.getByLabelText(/switch to (dark|light) mode/i)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Open menu"));
    // Still just the one toggle — it isn't duplicated into the dropdown too.
    expect(screen.getAllByLabelText(/switch to (dark|light) mode/i)).toHaveLength(1);
  });

  it("always renders the hamburger in the header's right-hand slot", () => {
    const { container } = render(
      <AppHeader menuItems={<button>Item</button>} center={<div>Center</div>} />,
    );
    const menuButton = screen.getByLabelText("Open menu");
    const headerRight = container.querySelector('[class*="headerRight"]');
    expect(headerRight?.contains(menuButton)).toBe(true);
  });
});
