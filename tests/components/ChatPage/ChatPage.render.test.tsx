/**
 * Rendering and basic UI tests for ChatPage
 */
import React from "react";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import ChatPage from "../../../app/components/ChatPage";

describe("ChatPage", () => {
  describe("Rendering", () => {
    beforeAll(() => {
      // Mock scrollIntoView for all elements
      window.HTMLElement.prototype.scrollIntoView = jest.fn();
    });

    it("renders ChatPage component with all key elements", () => {
      const { getByPlaceholderText, getByAltText, getByTestId } = render(
        <ChatPage />,
      );

      // Check for input field
      expect(
        getByPlaceholderText("Type in your message here..."),
      ).toBeInTheDocument();

      // Check for Bot image
      expect(getByAltText("Bot")).toBeInTheDocument();

      // Check for main structural elements
      expect(getByTestId("chat-layout")).toBeInTheDocument();
      expect(getByTestId("chat-header")).toBeInTheDocument();
      expect(getByTestId("chat-messages-container")).toBeInTheDocument();
      expect(getByTestId("chat-input-area")).toBeInTheDocument();
      expect(getByTestId("chat-input-container")).toBeInTheDocument();
      expect(getByTestId("chat-input")).toBeInTheDocument();
      expect(getByTestId("chat-send-button")).toBeInTheDocument();
    });
  });
});
