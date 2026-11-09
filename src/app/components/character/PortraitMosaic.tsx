import React, { useState } from "react";
import { displayCharacterName } from "character-chatbot-shared";
import styles from "../styles/CharsPage.module.css";
import { hashString, rotationDeg, type CharEntry } from "./charsGalleryHelpers";

/** Stable mosaic size, chosen by name so pagination never changes a portrait's place. */
function sizeClass(name: string): string {
  const bucket = hashString(name) % 100;
  if (bucket < 55) return styles.s1;
  if (bucket < 85) return styles.s2;
  return styles.s3;
}

/** One deckled archival print in the parchment mosaic. */
const CharTile: React.FC<{
  entry: CharEntry;
  onOpen: (entry: CharEntry) => void;
}> = ({ entry, onOpen }) => {
  const [loaded, setLoaded] = useState(false);

  return (
    <button
      type="button"
      className={`${styles.tile} ${sizeClass(entry.name)}`}
      style={{ "--rot": `${rotationDeg(entry.name)}deg` } as React.CSSProperties}
      onClick={() => onOpen(entry)}
      title={displayCharacterName(entry.name)}
      aria-label={`Open portrait of ${displayCharacterName(entry.name)}`}
    >
      <div className={styles.photoFrame}>
        {!loaded && <div className={styles.skeleton} aria-hidden="true" />}
        {/* Plain <img>, not next/image: sources mix Vercel Blob URLs and base64 data
            URIs (see src/db/schema.ts's avatar_cache comment), and this gallery can
            have hundreds of tiles across pages — native lazy-loading is the right
            tool, on top of the infinite-scroll pagination that limits how many
            tiles even exist in the DOM at once. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={entry.avatarUrl}
          alt={entry.name}
          loading="lazy"
          decoding="async"
          className={styles.image}
          onLoad={() => setLoaded(true)}
        />
      </div>
      <div className={styles.caption}>{displayCharacterName(entry.name)}</div>
    </button>
  );
};

/** Renders a dense masonry collage. */
const PortraitMosaic: React.FC<{
  entries: CharEntry[];
  groupLabel?: string;
  onOpen: (entry: CharEntry) => void;
}> = ({ entries, groupLabel, onOpen }) => (
  <div
    className={styles.mosaic}
    role="region"
    aria-label={`${groupLabel ? `${groupLabel} ` : ""}portrait collection`}
  >
    {entries.map((entry) => (
      <CharTile key={entry.name} entry={entry} onOpen={onOpen} />
    ))}
  </div>
);

export default PortraitMosaic;
