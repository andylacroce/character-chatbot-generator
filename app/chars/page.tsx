/**
 * Public mosaic gallery of every generated character portrait.
 * @module CharsPage
 */

import CharsGallery from "../components/CharsGallery";

export const metadata = {
  title: "Character Wall — Character Chatbot Generator",
  description: "A mosaic of every character portrait this app has generated.",
};

export default function CharsPage() {
  return <CharsGallery />;
}
