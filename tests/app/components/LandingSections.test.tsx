import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  GamesPanel,
  LandingFooterLinks,
  LandingHero,
} from "../../../src/app/components/character/LandingSections";

describe("LandingHero", () => {
  it("renders the headline and pitch", () => {
    render(<LandingHero />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Who will you bring to life?",
    );
    expect(screen.getByText(/history, mythology, or fiction/i)).toBeInTheDocument();
  });
});

describe("GamesPanel", () => {
  it("links to both guessing games", () => {
    render(<GamesPanel />);
    expect(screen.getByRole("link", { name: /^Guess Who\b(?!'s)/ })).toHaveAttribute(
      "href",
      "/guess-who",
    );
    expect(screen.getByRole("link", { name: /Guess Who's Next/ })).toHaveAttribute(
      "href",
      "/guess-who-next",
    );
  });
});

describe("LandingFooterLinks", () => {
  const setup = (authenticated: boolean) => {
    const onShowCharacterInfo = jest.fn();
    const onShowDisclaimer = jest.fn();
    render(
      <LandingFooterLinks
        authenticated={authenticated}
        onShowCharacterInfo={onShowCharacterInfo}
        onShowDisclaimer={onShowDisclaimer}
      />,
    );
    return { onShowCharacterInfo, onShowDisclaimer };
  };

  it("shows Past chats only when signed in", () => {
    setup(false);
    expect(screen.queryByRole("link", { name: "Past chats" })).not.toBeInTheDocument();
  });

  it("links to Past chats and Privacy when signed in", () => {
    setup(true);
    expect(screen.getByRole("link", { name: "Past chats" })).toHaveAttribute("href", "/history");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
  });

  it("calls the modal callbacks", () => {
    const { onShowCharacterInfo, onShowDisclaimer } = setup(false);
    fireEvent.click(screen.getByRole("button", { name: "Which characters can I create?" }));
    fireEvent.click(screen.getByRole("button", { name: "Read disclaimer" }));
    expect(onShowCharacterInfo).toHaveBeenCalledTimes(1);
    expect(onShowDisclaimer).toHaveBeenCalledTimes(1);
  });
});
