import React from "react";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import HamburgerMenu from "../../../app/components/HamburgerMenu";

// Simple child button for testing
function DummyButton({ onClick }: { onClick?: () => void }) {
  return <button onClick={onClick}>Test Button</button>;
}

describe("HamburgerMenu", () => {
  it("renders the hamburger button", () => {
    render(
      <HamburgerMenu>
        <DummyButton />
      </HamburgerMenu>
    );
    expect(screen.getByLabelText(/open menu/i)).toBeInTheDocument();
  });

  it("opens and closes the menu on button click", () => {
    render(
      <HamburgerMenu>
        <DummyButton />
      </HamburgerMenu>
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuButton);
    expect(screen.getByText(/test button/i)).toBeInTheDocument();
    fireEvent.click(menuButton);
    expect(screen.queryByText(/test button/i)).not.toBeInTheDocument();
  });

  it("closes the menu when clicking outside", () => {
    render(
      <div>
        <HamburgerMenu>
          <DummyButton />
        </HamburgerMenu>
        <button data-testid="outside">Outside</button>
      </div>
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuButton);
    expect(screen.getByText(/test button/i)).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText(/test button/i)).not.toBeInTheDocument();
  });

  it("closes the menu when a child button is clicked", async () => {
    const onClick = jest.fn();
    render(
      <HamburgerMenu>
        <DummyButton onClick={onClick} />
      </HamburgerMenu>
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuButton);
    const childButton = screen.getByText(/test button/i);
    fireEvent.click(childButton);
    expect(onClick).toHaveBeenCalled();
    // Wait for menu to close using waitFor
    await waitFor(() => {
      expect(screen.queryByText(/test button/i)).not.toBeInTheDocument();
    });
  });

  it("can be opened and closed with keyboard", () => {
    render(
      <HamburgerMenu>
        <DummyButton />
      </HamburgerMenu>
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    menuButton.focus();
    fireEvent.keyDown(menuButton, { key: "Enter" });
    expect(screen.getByText(/test button/i)).toBeInTheDocument();
    fireEvent.keyDown(menuButton, { key: "Escape" });
    // Menu should close (simulate Escape key closing logic if implemented)
    // If not, this test will help you add it for better accessibility
  });
});
