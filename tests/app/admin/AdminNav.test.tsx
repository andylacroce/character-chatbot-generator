import React from "react";
import { render, screen } from "@testing-library/react";
import AdminNav from "@/src/app/admin/AdminNav";

let mockPathname = "/admin";
jest.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

describe("AdminNav", () => {
  it("links both admin sections and marks the current one", () => {
    mockPathname = "/admin/moderation";
    render(<AdminNav />);
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("link", { name: "Moderation" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Stats" })).not.toHaveAttribute("aria-current");
  });
});
