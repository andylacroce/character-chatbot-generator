import React from "react";
import { render, screen } from "@testing-library/react";
import DataDeletionPage, { metadata } from "../../../src/app/data-deletion/page";

describe("DataDeletionPage", () => {
  it("renders the title and a link back to the app", () => {
    render(<DataDeletionPage />);
    expect(screen.getByRole("heading", { name: "Data Deletion Instructions" })).toBeInTheDocument();
    expect(screen.getByText(/Back to Portrayal/)).toHaveAttribute("href", "/");
  });

  it("explains guest data needs no request", () => {
    render(<DataDeletionPage />);
    expect(screen.getByText(/no account\s+to delete/)).toBeInTheDocument();
  });

  it("explains self-serve deletion on web and mobile", () => {
    render(<DataDeletionPage />);
    expect(screen.getByText(/On the web:/)).toBeInTheDocument();
    expect(screen.getByText(/In the mobile app:/)).toBeInTheDocument();
    expect(screen.getByText(/Deletion happens immediately/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Deleting individual chats" })).toBeInTheDocument();
  });

  it("gives a mailto fallback with a prefilled subject for deletion requests", () => {
    render(<DataDeletionPage />);
    const [link] = screen.getAllByText("portrayal-support@andrewlacroce.com");
    expect(link).toHaveAttribute(
      "href",
      "mailto:portrayal-support@andrewlacroce.com?subject=Data%20deletion%20request",
    );
  });

  it("notes the shared avatar cache is not personal data and is not deleted", () => {
    render(<DataDeletionPage />);
    expect(screen.getByText(/shared across all users/)).toBeInTheDocument();
  });

  it("offers an email route for chat logs no account deletion can find", () => {
    render(<DataDeletionPage />);
    expect(screen.getByText(/from guest sessions/)).toBeInTheDocument();
    expect(screen.getAllByText("portrayal-support@andrewlacroce.com")[1]).toHaveAttribute(
      "href",
      "mailto:portrayal-support@andrewlacroce.com?subject=Chat%20log%20deletion%20request",
    );
  });

  it("links to the full privacy policy", () => {
    render(<DataDeletionPage />);
    expect(screen.getByText("Privacy Policy")).toHaveAttribute("href", "/privacy");
  });

  it("exports page metadata", () => {
    expect(metadata.title).toContain("Data Deletion");
  });
});
