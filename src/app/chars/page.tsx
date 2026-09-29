/**
 * Public mosaic gallery of every generated character portrait.
 * @module CharsPage
 */

import CharsGallery from "../components/CharsGallery";

export const metadata = {
  title: "Character Wall — Portrayal",
  description: "A mosaic of every character portrait this app has generated.",
};

/** Renders the wall and forwards an optional deep-linked portrait name. */
export default async function CharsPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string | string[] }>;
}) {
  const { name } = await searchParams;
  return <CharsGallery initialCharacterName={typeof name === "string" ? name : undefined} />;
}
