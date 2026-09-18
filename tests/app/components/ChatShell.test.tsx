import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import ChatShell from "../../../app/components/ChatShell";
import type { Bot } from "../../../app/components/BotCreator";
import type { Message } from "../../../src/types/message";

const mockBot: Bot = {
  name: "Sherlock Holmes",
  personality: "deductive",
  avatarUrl: "/silhouette.svg",
  voiceConfig: null,
};

function baseProps(overrides: Partial<React.ComponentProps<typeof ChatShell>> = {}) {
  return {
    bot: mockBot,
    messages: [] as Message[],
    menuItems: <button type="button">Menu Item</button>,
    input: "",
    setInput: jest.fn(),
    onSend: jest.fn(),
    onKeyDown: jest.fn(),
    loading: false,
    apiAvailable: true,
    chatBoxRef: { current: null } as unknown as React.RefObject<HTMLDivElement>,
    inputRef: { current: null } as React.RefObject<HTMLInputElement | null>,
    audioEnabled: true,
    onAudioToggle: jest.fn(),
    onStopAudio: jest.fn(),
    isAudioPlaying: false,
    error: "",
    ...overrides,
  };
}

describe("ChatShell", () => {
  it("renders the bot's name and avatar in the header", () => {
    render(<ChatShell {...baseProps()} />);
    expect(screen.getByText("Sherlock Holmes")).toBeInTheDocument();
    expect(screen.getAllByAltText("Sherlock Holmes").length).toBeGreaterThan(0);
  });

  it("renders the transcript messages", () => {
    render(
      <ChatShell
        {...baseProps({
          messages: [
            { sender: "Sherlock Holmes", text: "Greetings, detective." },
            { sender: "User", text: "Hello!" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Greetings, detective.")).toBeInTheDocument();
    expect(screen.getByText("Hello!")).toBeInTheDocument();
  });

  it("renders custom menu items passed by the caller", () => {
    render(<ChatShell {...baseProps()} />);
    fireEvent.click(screen.getByLabelText(/open menu/i));
    expect(screen.getByText("Menu Item")).toBeInTheDocument();
  });

  it("renders the belowName slot inside the header", () => {
    render(<ChatShell {...baseProps({ belowName: <div data-testid="streak">Streak: 1</div> })} />);
    expect(screen.getByTestId("streak")).toBeInTheDocument();
  });

  it("renders modals and bannerContent slots", () => {
    render(
      <ChatShell
        {...baseProps({
          modals: <div data-testid="a-modal">Modal</div>,
          bannerContent: <div data-testid="a-banner">Banner</div>,
        })}
      />,
    );
    expect(screen.getByTestId("a-modal")).toBeInTheDocument();
    expect(screen.getByTestId("a-banner")).toBeInTheDocument();
  });

  it("shows the loading spinner when loading is true", () => {
    render(<ChatShell {...baseProps({ loading: true })} />);
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("does not show the loading spinner when loading is false", () => {
    render(<ChatShell {...baseProps({ loading: false })} />);
    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });

  it("opens the portrait lightbox when the header avatar is clicked", () => {
    render(<ChatShell {...baseProps()} />);
    fireEvent.click(screen.getByLabelText(/view character portrait/i));
    expect(screen.getAllByAltText("Sherlock Holmes").length).toBeGreaterThan(1);
  });

  it("calls onSend when the send button is clicked with input", () => {
    const onSend = jest.fn();
    render(<ChatShell {...baseProps({ input: "hello", onSend })} />);
    fireEvent.click(screen.getByTestId("chat-send-button"));
    expect(onSend).toHaveBeenCalled();
  });

  it("displays an error message via ChatStatus", () => {
    render(<ChatShell {...baseProps({ error: "Something went wrong" })} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });
});
