import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GameInstructionsModal from "@/app/components/GameInstructionsModal";

describe("GameInstructionsModal", () => {
  it("renders nothing when show is false", () => {
    const { container } = render(<GameInstructionsModal show={false} onClose={jest.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the how-to-play copy when show is true", () => {
    render(<GameInstructionsModal show={true} onClose={jest.fn()} />);
    expect(screen.getByTestId("game-instructions-modal-backdrop")).toBeInTheDocument();
    expect(screen.getByText("How to play")).toBeInTheDocument();
  });

  it("describes guessing in the same chat box, not a separate guess control", () => {
    render(<GameInstructionsModal show={true} onClose={jest.fn()} />);
    expect(screen.getByText(/right into the same chat box/i)).toBeInTheDocument();
    expect(screen.queryByText(/who are they describing\?/i)).not.toBeInTheDocument();
  });

  it("calls onClose when the backdrop is clicked", () => {
    const onClose = jest.fn();
    render(<GameInstructionsModal show={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId("game-instructions-modal-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = jest.fn();
    render(<GameInstructionsModal show={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the 'Got it' button is clicked", () => {
    const onClose = jest.fn();
    render(<GameInstructionsModal show={true} onClose={onClose} />);
    fireEvent.click(screen.getByText("Got it, let's play"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when Escape is pressed while shown", () => {
    const onClose = jest.fn();
    render(<GameInstructionsModal show={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
