import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import axios from "axios";
import ChatPage from "../../../app/components/ChatPage";
jest.mock("axios");

describe("ChatPage", () => {
  describe("Send Message", () => {
    beforeEach(() => {
      jest.resetAllMocks();
      jest.mocked(axios.get).mockResolvedValue({ data: { status: "ok" } }); // Mock health check
      // Mock scrollIntoView for all elements
      window.HTMLElement.prototype.scrollIntoView = jest.fn();
    });

    it("sends a message and receives a reply", async () => {
      jest.mocked(axios.post).mockResolvedValue({
        data: {
          reply: "You shall not pass!",
          audioFileUrl: "/api/audio?file=bot_reply.mp3",
        },
      });
      const { getByTestId, getByText } = render(<ChatPage />);

      const input = getByTestId("chat-input");
      const sendButton = getByTestId("chat-send-button");
      expect(sendButton).toBeInTheDocument();

      // Send message
      fireEvent.change(input, { target: { value: "Hello, Bot!" } });
      fireEvent.click(sendButton);

      // Verify API call
      expect(axios.post).toHaveBeenCalledWith("/api/chat", {
        message: "Hello, Bot!",
      });

      // Check that both messages appear in the chat
      await waitFor(() => {
        expect(getByText("Hello, Bot!")).toBeInTheDocument();
        expect(getByText("You shall not pass!")).toBeInTheDocument();
      });
    });

    it("clears the input after sending a message", async () => {
      jest.mocked(axios.post).mockResolvedValue({
        data: {
          reply: "You shall not pass!",
          audioFileUrl: "/api/audio?file=bot_reply.mp3",
        },
      });
      const { getByTestId } = render(<ChatPage />);

      const input = getByTestId("chat-input");
      const sendButton = getByTestId("chat-send-button");
      expect(sendButton).toBeInTheDocument();

      // Send message and check input is cleared
      fireEvent.change(input, { target: { value: "Hello, Bot!" } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect((input as HTMLInputElement).value).toBe("");
      });
    });

    it("does not send a message when input is empty", () => {
      const { getByTestId } = render(<ChatPage />);
      const sendButton = getByTestId("chat-send-button");
      expect(sendButton).toBeInTheDocument();

      fireEvent.click(sendButton);
      expect(axios.post).not.toHaveBeenCalled();
    });

    it("sends a message when pressing Enter key", async () => {
      jest.mocked(axios.post).mockResolvedValue({
        data: {
          reply: "You shall not pass!",
          audioFileUrl: "/api/audio?file=bot_reply.mp3",
        },
      });
      const { getByTestId, getByText } = render(<ChatPage />);

      const input = getByTestId("chat-input");
      fireEvent.change(input, { target: { value: "Hello, Bot!" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(axios.post).toHaveBeenCalledWith("/api/chat", {
        message: "Hello, Bot!",
      });

      await waitFor(() => {
        expect(getByText("Hello, Bot!")).toBeInTheDocument();
        expect(getByText("You shall not pass!")).toBeInTheDocument();
      });
    });
  });
});
