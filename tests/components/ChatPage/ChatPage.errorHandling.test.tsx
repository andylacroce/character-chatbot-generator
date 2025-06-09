import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import axios from "axios";
import ChatPage from "../../../app/components/ChatPage";
jest.mock("axios");

describe("ChatPage", () => {
  describe("Error Handling", () => {
    beforeEach(() => {
      jest.resetAllMocks();
      jest.mocked(axios.get).mockResolvedValue({ data: { status: "ok" } }); // Mock health check
      // Mock scrollIntoView to prevent errors in tests
      window.HTMLElement.prototype.scrollIntoView = jest.fn();
    });

    it("displays an error message when the API call fails", async () => {
      jest.mocked(axios.post).mockRejectedValue(new Error("API call failed"));
      const { getByTestId, getByText } = render(<ChatPage />);

      const input = getByTestId("chat-input");
      const sendButton = getByTestId("chat-send-button");
      expect(sendButton).toBeInTheDocument();

      fireEvent.change(input, { target: { value: "Hello, Bot!" } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(
          getByText("Error sending message. Please try again."),
        ).toBeInTheDocument();
      });
    });

    it("handles network errors gracefully", async () => {
      jest.mocked(axios.post).mockRejectedValue(new Error("Network Error"));
      const { getByTestId, getByText } = render(<ChatPage />);

      const input = getByTestId("chat-input");
      const sendButton = getByTestId("chat-send-button");
      expect(sendButton).toBeInTheDocument();

      fireEvent.change(input, { target: { value: "Hello, Bot!" } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(
          getByText("Error sending message. Please try again."),
        ).toBeInTheDocument();
      });
    });

    it("shows API unavailability message when health check fails", async () => {
      // Mock health check failure
      jest
        .mocked(axios.get)
        .mockRejectedValue(new Error("Service unavailable"));

      const { getByText, queryByTestId } = render(<ChatPage />);

      await waitFor(() => {
        expect(queryByTestId("api-error-message")).toBeInTheDocument();
        expect(getByText(/Gandalf has vanished from the White Council/i)).toBeInTheDocument();
        expect(getByText(/The Grey Pilgrim is away, perhaps consulting with Elrond or lost in thought atop Orthanc/i)).toBeInTheDocument();
      });
    });
  });
});
