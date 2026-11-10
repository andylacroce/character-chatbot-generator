import React from "react";
import { render, screen } from "@testing-library/react";
import { ReportsSection } from "../../../src/app/admin/moderation/ReportsSection";

jest.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));

const mockFetch = jest.fn();
jest.mock("../../../src/utils/api", () => ({
  authenticatedFetch: (...args: unknown[]) => mockFetch(...args),
}));

describe("ReportsSection", () => {
  it("links each report to the character's Wall lightbox in a new tab", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          {
            id: 1,
            targetType: "message",
            characterName: "Joan d'Arc",
            messageText: "a reply",
            reason: "offensive",
            details: null,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
    });
    render(<ReportsSection onChanged={jest.fn()} />);
    const link = await screen.findByRole("link", { name: "Joan d'Arc" });
    expect(link).toHaveAttribute("href", "/characters?name=Joan%20d'Arc");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText("a reply")).toBeInTheDocument();
  });
});
