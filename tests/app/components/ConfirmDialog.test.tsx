import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ConfirmDialog from "../../../src/app/components/ConfirmDialog";

const copy = {
  title: "Delete it?",
  body: "Gone forever.",
  confirmLabel: "Delete",
  cancelLabel: "Cancel",
  errorMessage: "Couldn't delete.",
};

describe("ConfirmDialog", () => {
  it("renders nothing when hidden", () => {
    const { container } = render(
      <ConfirmDialog show={false} copy={copy} onConfirm={jest.fn()} onClose={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("cancel closes without confirming", () => {
    const onClose = jest.fn();
    const onConfirm = jest.fn();
    render(<ConfirmDialog show copy={copy} onConfirm={onConfirm} onClose={onClose} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("runs the action on confirm", async () => {
    const onConfirm = jest.fn().mockResolvedValue(undefined);
    render(<ConfirmDialog show copy={copy} onConfirm={onConfirm} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the error message and re-enables buttons when the action fails", async () => {
    const onConfirm = jest.fn().mockRejectedValue(new Error("500"));
    render(<ConfirmDialog show copy={copy} onConfirm={onConfirm} onClose={jest.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't delete.");
    expect(screen.getByRole("button", { name: "Delete" })).not.toBeDisabled();
  });
});
