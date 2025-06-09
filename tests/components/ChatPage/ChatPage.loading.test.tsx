import React from "react";
import {
  render,
  fireEvent,
  waitFor,
  waitForElementToBeRemoved,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import axios from "axios";
import ChatPage from "../../../app/components/ChatPage";
jest.mock("axios");
jest.useFakeTimers();

describe("ChatPage", () => {
  describe("Loading States", () => {
    beforeEach(() => {
      jest.resetAllMocks();
      jest.mocked(axios.get).mockResolvedValue({ data: { status: "ok" } }); // Mock health check
      // Mock scrollIntoView for all elements
      window.HTMLElement.prototype.scrollIntoView = jest.fn();
    });

    it("disables the input and button while loading", async () => {
      // Setup mock that doesn't resolve immediately to keep loading state active
      jest.mocked(axios.post).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: {
                    reply: "You shall not pass!",
                    audioFileUrl: "/api/audio?file=bot_reply.mp3",
                  },
                }),
              2000,
            ),
          ),
      );

      const { getByTestId } = render(<ChatPage />);
      const input = getByTestId("chat-input");
      const sendButton = getByTestId("chat-send-button");
      expect(sendButton).toBeInTheDocument();

      // Trigger sending message
      fireEvent.change(input, { target: { value: "Hello, Bot!" } });
      fireEvent.click(sendButton);

      // Verify disabled state during loading
      expect(input).toBeDisabled();
      expect(sendButton).toHaveClass("disabled");
      expect(sendButton).toBeDisabled();

      // Resolve the promise
      jest.advanceTimersByTime(2000);

      // Verify enabled state after loading
      await waitFor(() => {
        expect(input).not.toBeDisabled();
        expect(sendButton).not.toBeDisabled();
      });
    });

    it("displays a loading indicator while waiting for a reply", async () => {
      jest.mocked(axios.post).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: {
                    reply: "You shall not pass!",
                    audioFileUrl: "/api/audio?file=bot_reply.mp3",
                  },
                }),
              1000,
            ),
          ),
      );

      const { getByTestId } = render(<ChatPage />);
      const input = getByTestId("chat-input");
      const sendButton = getByTestId("chat-send-button");
      expect(sendButton).toBeInTheDocument();

      // Send message
      fireEvent.change(input, { target: { value: "Hello, Bot!" } });
      fireEvent.click(sendButton);

      // Advance timer to trigger loading state
      jest.advanceTimersByTime(100);

      // Check for loading indicator
      await waitFor(() => {
        expect(getByTestId("loading-indicator")).toBeInTheDocument();
      });

      // Complete request
      jest.advanceTimersByTime(1000);

      // Wait for loading indicator to disappear
      await waitForElementToBeRemoved(() => getByTestId("loading-indicator"), {
        timeout: 5000,
      });
    });

    it("shows 'HOLD' text on button while loading", async () => {
      jest.mocked(axios.post).mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: {
                    reply: "You shall not pass!",
                    audioFileUrl: "/api/audio?file=bot_reply.mp3",
                  },
                }),
              1000,
            ),
          ),
      );

      const { getByTestId } = render(<ChatPage />);
      const input = getByTestId("chat-input");
      const sendButton = getByTestId("chat-send-button");
      expect(sendButton).toBeInTheDocument();
      expect(sendButton!.textContent).toBe("Send");

      // Send message
      fireEvent.change(input, { target: { value: "Hello, Bot!" } });
      fireEvent.click(sendButton);

      // Check button text changed to HOLD
      expect(sendButton!.textContent).toBe("HOLD");

      // Complete request
      jest.advanceTimersByTime(1000);

      // Verify button text returns to Send
      await waitFor(() => {
        expect(sendButton!.textContent).toBe("Send");
      });
    });
  });
});
