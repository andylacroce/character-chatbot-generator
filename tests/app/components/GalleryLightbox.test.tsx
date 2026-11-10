import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import GalleryLightbox from "../../../src/app/components/character/GalleryLightbox";
import type { AdminState } from "../../../src/app/components/character/useGalleryLightbox";

const entry = { name: "Ada Lovelace", avatarUrl: "ada.png", category: "history" as const };

function setup(overrides: Partial<React.ComponentProps<typeof GalleryLightbox>> = {}) {
  const props = {
    dialogRef: React.createRef<HTMLDialogElement>(),
    selected: entry,
    isAdmin: false,
    adminState: "idle" as AdminState,
    onClose: jest.fn(),
    onDialogClose: jest.fn(),
    onRegenerate: jest.fn(),
    onPurge: jest.fn(),
    onCategoryChange: jest.fn(),
    ...overrides,
  };
  render(<GalleryLightbox {...props} />);
  return props;
}

describe("GalleryLightbox", () => {
  // jsdom doesn't render closed <dialog> content as accessible; query by hidden: true.
  const byRole = (role: string, name: string | RegExp) =>
    screen.getByRole(role as never, { name, hidden: true });

  it("renders nothing inside the dialog when no portrait is selected", () => {
    setup({ selected: null });
    expect(screen.queryByAltText("Ada Lovelace")).not.toBeInTheDocument();
  });

  it("links to the chat launch point and the character page", () => {
    setup();
    expect(byRole("link", /Chat with/)).toHaveAttribute("href", "/?name=Ada%20Lovelace");
    expect(byRole("link", "Character page")).toHaveAttribute("href", "/characters/ada-lovelace");
  });

  it("closes from the image and the close button", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByAltText("Ada Lovelace"));
    fireEvent.click(byRole("button", "Close"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("hides the admin controls from non-admins", () => {
    setup();
    expect(screen.queryByText("Regenerate portrait")).not.toBeInTheDocument();
  });

  it("lets an admin move the character to another category", () => {
    const { onCategoryChange } = setup({ isAdmin: true });
    const select = byRole("combobox", "Category");
    expect(select).toHaveValue("history");
    fireEvent.change(select, { target: { value: "literature" } });
    expect(onCategoryChange).toHaveBeenCalledWith(entry, "literature");
  });

  it("calls the admin handlers with the selected entry", () => {
    const { onRegenerate, onPurge } = setup({ isAdmin: true });
    fireEvent.click(byRole("button", "Regenerate portrait"));
    fireEvent.click(byRole("button", "Purge portrait"));
    expect(onRegenerate).toHaveBeenCalledWith(entry);
    expect(onPurge).toHaveBeenCalledWith(entry);
  });

  it.each([
    ["confirm", "Click again to purge"],
    ["purging", "Purging..."],
    ["purgeError", "Purge failed, retry"],
    ["regenerating", "Regenerating..."],
    ["regenError", "Regenerate failed, retry"],
  ] as Array<[AdminState, string]>)("labels the %s state", (adminState, label) => {
    setup({ isAdmin: true, adminState });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("disables both admin buttons while a request is running", () => {
    setup({ isAdmin: true, adminState: "purging" });
    expect(byRole("button", "Purging...")).toBeDisabled();
    expect(byRole("button", "Regenerate portrait")).toBeDisabled();
  });
});
