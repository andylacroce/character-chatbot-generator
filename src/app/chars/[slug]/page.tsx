/**
 * Public, indexable page for one character on the Wall: portrait, name, category, and a way into
 * a chat. A server component so crawlers and link previews get real content and metadata.
 * @module CharacterPage
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
// Deep imports, not the package root: the root re-exports React hooks, which a Server Component bundle rejects.
import { getCharacterCategoryLabel } from "character-chatbot-shared/src/characterCategories";
import { characterSlug, displayCharacterName } from "character-chatbot-shared/src/validation";
import { getCharacterBySlug } from "../../../utils/charactersWall";
import { SITE_URL } from "../../../utils/site";
import styles from "../../components/styles/CharacterPage.module.css";

type Params = { params: Promise<{ slug: string }> };

/** Looks the slug up, tolerating a missing database (the Wall is empty without one). */
async function loadCharacter(slug: string) {
  try {
    return await getCharacterBySlug(slug);
  } catch {
    return null;
  }
}

/** Metadata for link previews and search: title, description, canonical URL, and the portrait when it is a real URL. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const character = await loadCharacter((await params).slug);
  if (!character) return { title: "Character not found — Portrayal", robots: { index: false } };
  const name = displayCharacterName(character.name);
  const category = getCharacterCategoryLabel(character.category);
  const title = `Chat with ${name} — Portrayal`;
  const description = `Talk with an AI portrayal of ${name} (${category}), or try to guess who a mystery character is. Free to try, no sign-up.`;
  const url = `${SITE_URL}/chars/${characterSlug(character.name)}`;
  // Data URLs (portraits stored without Vercel Blob) are not usable as preview images.
  const images = /^https:\/\//.test(character.avatarUrl) ? [character.avatarUrl] : undefined;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website", images },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images },
  };
}

/** Renders one character's page, or the 404 page when the slug matches nothing. */
export default async function CharacterPage({ params }: Params) {
  const character = await loadCharacter((await params).slug);
  if (!character) notFound();
  const name = displayCharacterName(character.name);
  return (
    <div className={styles.page}>
      <Link href="/chars" className={styles.back}>
        &larr; All characters
      </Link>
      {/* Plain <img>, not next/image: sources mix Vercel Blob URLs and base64 data URLs. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={character.avatarUrl} alt={`Portrait of ${name}`} className={styles.portrait} />
      <h1 className={styles.title}>{name}</h1>
      <p className={styles.category}>{getCharacterCategoryLabel(character.category)}</p>
      <Link href={`/?name=${encodeURIComponent(character.name)}`} className={styles.cta}>
        Chat with {name}
      </Link>
      <p className={styles.blurb}>
        Portrayal lets you talk with historical figures, legends, and literary icons, or play Guess
        Who and work out which character you are speaking to.
      </p>
    </div>
  );
}
