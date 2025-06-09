import React from "react";
import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import axios from "axios";
import ChatPage from "../../../app/components/ChatPage";
jest.mock("axios");

describe("ChatPage API connectivity", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Mock scrollIntoView for all elements
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: jest.fn(),
    });
  });

  it("shows API connectivity error and disables chat if /api/health fails", async () => {
    jest.mocked(axios.get).mockRejectedValue(new Error("Network Error"));
    const { getByTestId } = render(<ChatPage />);

    // Check for API error message
    await waitFor(() => {
      expect(getByTestId("api-error-message")).toBeInTheDocument();
    });

    // The input should be present and disabled when API is down
    const input = getByTestId("chat-input");
    const button = getByTestId("chat-send-button");

    expect(input).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(button).toBeDisabled();
    expect(button.textContent).toBe("HOLD");
  });

  it("does not show API error if /api/health succeeds", async () => {
    jest.mocked(axios.get).mockResolvedValue({ data: { status: "ok" } });
    const { queryByTestId, getByPlaceholderText, getByTestId } = render(
      <ChatPage />,
    );

    await waitFor(() => {
      expect(
        getByPlaceholderText("Type in your message here..."),
      ).not.toBeDisabled();
      const button = getByTestId("chat-send-button");
      expect(button).not.toBeDisabled();
      expect(button.textContent).toBe("Send");
    });

    expect(queryByTestId("api-error-message")).not.toBeInTheDocument();
  });

  it("applies correct styling to disabled elements when API is unavailable", async () => {
    jest.mocked(axios.get).mockRejectedValue(new Error("Service unavailable"));

    const { getByTestId, container } = render(<ChatPage />);

    await waitFor(() => {
      const button = getByTestId("chat-send-button");
      expect(button).toHaveClass("disabled");

      // Check that modal backdrop is shown
      expect(getByTestId("modal-backdrop")).toBeInTheDocument();

      // Check for updated modal text
      expect(getByTestId("api-error-message")).toBeInTheDocument();
      expect(getByTestId("api-error-message").textContent).toMatch(/Bot has vanished from the chat/i);

      // Chat input should be empty placeholder when API is down
      const input = getByTestId("chat-input") as HTMLInputElement;
      expect(input.placeholder).toBe("");
    });
  });
});
