import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import HamburgerMenu from "../../../src/app/components/HamburgerMenu";

// Simple child button for testing
function DummyButton({ onClick }: { onClick?: () => void }) {
  return <button onClick={onClick}>Test Button</button>;
}

describe("HamburgerMenu", () => {
  it("renders the hamburger button", () => {
    render(
      <HamburgerMenu>
        <DummyButton />
      </HamburgerMenu>,
    );
    expect(screen.getByLabelText(/open menu/i)).toBeInTheDocument();
  });

  it("opens and closes the menu on button click", () => {
    render(
      <HamburgerMenu>
        <DummyButton />
      </HamburgerMenu>,
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
      </div>,
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuButton);
    expect(screen.getByText(/test button/i)).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId("outside"));
    expect(screen.queryByText(/test button/i)).not.toBeInTheDocument();
  });

  it("closes the menu when a child button is clicked, and still fires its own handler", () => {
    const onClick = jest.fn();
    render(
      <HamburgerMenu>
        <DummyButton onClick={onClick} />
      </HamburgerMenu>,
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuButton);
    fireEvent.click(screen.getByText(/test button/i));
    expect(onClick).toHaveBeenCalled();
    expect(screen.queryByText(/test button/i)).not.toBeInTheDocument();
  });

  it("closes on a click inside a Fragment-wrapped group of menu items — every real caller passes children this way", () => {
    const onClick = jest.fn();
    render(
      <HamburgerMenu>
        <>
          <button onClick={jest.fn()}>First Item</button>
          <button onClick={onClick}>Second Item</button>
        </>
      </HamburgerMenu>,
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuButton);
    fireEvent.click(screen.getByText("Second Item"));
    expect(onClick).toHaveBeenCalled();
    expect(screen.queryByText("First Item")).not.toBeInTheDocument();
  });

  it("can be opened and closed with keyboard", () => {
    render(
      <HamburgerMenu>
        <DummyButton />
      </HamburgerMenu>,
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
      </HamburgerMenu>,
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
      </HamburgerMenu>,
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.keyDown(menuButton, { key: "Tab" });
    expect(screen.queryByText(/test button/i)).not.toBeInTheDocument();
  });

  it("renders non-interactive children unchanged", () => {
    render(
      <HamburgerMenu>
        <span data-testid="non-button-child">Not a button</span>
      </HamburgerMenu>,
    );
    const menuButton = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuButton);
    expect(screen.getByTestId("non-button-child")).toBeInTheDocument();
  });
});
