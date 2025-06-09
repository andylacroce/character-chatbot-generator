import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import ApiUnavailableModal from "../../app/components/ApiUnavailableModal";

describe("ApiUnavailableModal", () => {
  it("renders nothing when show is false", () => {
    const { container } = render(<ApiUnavailableModal show={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders modal with correct roleplay message when show is true", () => {
    const { getByTestId, getByText } = render(<ApiUnavailableModal show={true} />);
    const modal = getByTestId("modal-backdrop");
    expect(modal).toBeInTheDocument();
    expect(getByTestId("api-error-message")).toBeInTheDocument();
    expect(getByText(/Bot has vanished from the chat/i)).toBeInTheDocument();
    expect(getByText(/The bot is temporarily unavailable or reloading. Please try again soon./i)).toBeInTheDocument();
  });
});
