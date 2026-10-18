import { render, screen } from "@testing-library/react";

const mockGetCharacterBySlug = jest.fn();
jest.mock("../../../src/utils/charactersWall", () => ({
  getCharacterBySlug: (...args: unknown[]) => mockGetCharacterBySlug(...args),
}));
const mockNotFound = jest.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
jest.mock("next/navigation", () => ({ notFound: () => mockNotFound() }));

import CharacterPage, { generateMetadata } from "../../../src/app/chars/[slug]/page";

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });
const joan = {
  name: "Joan of Arc",
  avatarUrl: "https://blob.example.com/joan.png",
  category: "history",
  createdAtMs: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCharacterBySlug.mockResolvedValue(joan);
});

describe("generateMetadata", () => {
  it("builds title, description, canonical URL and a large preview image", async () => {
    const meta = await generateMetadata(params("joan-of-arc"));

    expect(meta.title).toBe("Chat with Joan of Arc — Portrayal");
    expect(meta.description).toContain("Historical Figures");
    expect(meta.alternates?.canonical).toBe(
      "https://character-chatbot-generator.vercel.app/chars/joan-of-arc",
    );
    expect(meta.openGraph?.images).toEqual([joan.avatarUrl]);
    expect(meta.twitter).toMatchObject({ card: "summary_large_image" });
    expect(mockGetCharacterBySlug).toHaveBeenCalledWith("joan-of-arc");
  });

  it("omits the preview image for a data-URL portrait", async () => {
    mockGetCharacterBySlug.mockResolvedValue({ ...joan, avatarUrl: "data:image/png;base64,AAAA" });
    const meta = await generateMetadata(params("joan-of-arc"));

    expect(meta.openGraph?.images).toBeUndefined();
    expect(meta.twitter).toMatchObject({ card: "summary" });
  });

  it("keeps an unknown slug out of search results", async () => {
    mockGetCharacterBySlug.mockResolvedValue(null);
    const meta = await generateMetadata(params("nobody"));

    expect(meta.robots).toMatchObject({ index: false });
  });

  it("treats a database failure like an unknown character", async () => {
    mockGetCharacterBySlug.mockRejectedValue(new Error("db down"));
    const meta = await generateMetadata(params("joan-of-arc"));

    expect(meta.robots).toMatchObject({ index: false });
  });
});

describe("CharacterPage", () => {
  it("shows the portrait, name, category and a chat link into the app", async () => {
    render(await CharacterPage(params("joan-of-arc")));

    expect(screen.getByRole("heading", { name: "Joan of Arc" })).toBeInTheDocument();
    expect(screen.getByAltText("Portrait of Joan of Arc")).toHaveAttribute("src", joan.avatarUrl);
    expect(screen.getByText("Historical Figures")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat with Joan of Arc" })).toHaveAttribute(
      "href",
      "/?name=Joan%20of%20Arc",
    );
    expect(screen.getByRole("link", { name: /All characters/ })).toHaveAttribute("href", "/chars");
  });

  it("hides a disambiguation qualifier from display but keeps it in the chat link", async () => {
    mockGetCharacterBySlug.mockResolvedValue({
      ...joan,
      name: "David Copperfield (Charles Dickens novel)",
      category: "literature",
    });
    render(await CharacterPage(params("david-copperfield-charles-dickens-novel")));

    expect(screen.getByRole("heading", { name: "David Copperfield" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Chat with David Copperfield" })).toHaveAttribute(
      "href",
      "/?name=David%20Copperfield%20(Charles%20Dickens%20novel)",
    );
  });

  it("renders the 404 page for an unknown slug", async () => {
    mockGetCharacterBySlug.mockResolvedValue(null);

    await expect(CharacterPage(params("nobody"))).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
