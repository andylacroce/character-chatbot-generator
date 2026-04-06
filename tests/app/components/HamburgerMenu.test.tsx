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
  });

  it("pressing Space key opens and closes the menu", () => {
    render(
      <HamburgerMenu>
        <DummyButton />
      </HamburgerMenu>
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.keyDown(menuButton, { key: " " });
    expect(screen.getByText(/test button/i)).toBeInTheDocument();
    fireEvent.keyDown(menuButton, { key: " " });
    expect(screen.queryByText(/test button/i)).not.toBeInTheDocument();
  });

  it("non-Enter/non-Space key does not toggle menu", () => {
    render(
      <HamburgerMenu>
        <DummyButton />
      </HamburgerMenu>
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.keyDown(menuButton, { key: "Tab" });
    expect(screen.queryByText(/test button/i)).not.toBeInTheDocument();
  });

  it("non-button element child is passed through unchanged", () => {
    render(
      <HamburgerMenu>
        <span data-testid="non-button-child">Not a button</span>
      </HamburgerMenu>
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuButton);
    expect(screen.getByTestId("non-button-child")).toBeInTheDocument();
  });

  it("function component child without onClick prop is treated as button-like false branch", () => {
    function NoClickChild() {
      return <button data-testid="no-click-btn">No Click</button>;
    }
    render(
      <HamburgerMenu>
        <NoClickChild />
      </HamburgerMenu>
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuButton);
    expect(screen.getByTestId("no-click-btn")).toBeInTheDocument();
  });

  it("string child (non-React-element) passes through unchanged (L57 if[0])", () => {
    render(
      <HamburgerMenu>
        {"Text node child"}
      </HamburgerMenu>
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuButton);
    expect(screen.getByText("Text node child")).toBeInTheDocument();
  });

  it("native button child with no onClick closes menu without error (L68 if[1])", async () => {
    render(
      <HamburgerMenu>
        <button>No Handler</button>
      </HamburgerMenu>
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuButton);
    const childButton = screen.getByText("No Handler");
    fireEvent.click(childButton);
    await waitFor(() => {
      expect(screen.queryByText("No Handler")).not.toBeInTheDocument();
    });
  });
});
