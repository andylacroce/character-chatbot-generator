import React from "react";
import Link from "next/link";
import {
  CHARACTER_CATEGORIES,
  characterSlug,
  displayCharacterName,
  type CharacterCategory,
} from "character-chatbot-shared";
import styles from "../styles/CharsPage.module.css";
import type { CharEntry } from "./charsGalleryHelpers";
import type { AdminState } from "./useGalleryLightbox";

interface GalleryLightboxProps {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  selected: CharEntry | null;
  isAdmin: boolean;
  adminState: AdminState;
  onClose: () => void;
  onDialogClose: () => void;
  onRegenerate: (entry: CharEntry) => void;
  onPurge: (entry: CharEntry) => void;
  onCategoryChange: (entry: CharEntry, category: CharacterCategory) => void;
}

/**
 * Native <dialog> lightbox — showModal()/close() give focus-trapping and
 * Escape-to-close for free, no modal library needed. Backdrop click closes
 * it via the click-target check below; ::backdrop is styled in the CSS
 * module for the dim/blur behind it.
 */
const GalleryLightbox: React.FC<GalleryLightboxProps> = ({
  dialogRef,
  selected,
  isAdmin,
  adminState,
  onClose,
  onDialogClose,
  onRegenerate,
  onPurge,
  onCategoryChange,
}) => (
  <dialog
    ref={dialogRef}
    className={styles.lightbox}
    onClick={(e) => {
      if (e.target === dialogRef.current) onClose();
    }}
    onClose={onDialogClose}
  >
    {selected && (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={selected.avatarUrl}
          alt={selected.name}
          className={styles.lightboxImage}
          onClick={onClose}
        />
        <p className={styles.lightboxName}>{displayCharacterName(selected.name)}</p>
        {/* Same launch point the landing page itself uses for a name typed
          into the creator (BotCreator's ?name= auto-submit effect) — it
          resumes this signed-in user's own saved character by that exact
          name if one exists, or creates a fresh one otherwise. */}
        <Link href={`/?name=${encodeURIComponent(selected.name)}`} className={styles.lightboxChat}>
          Chat with {displayCharacterName(selected.name)} &rarr;
        </Link>
        {characterSlug(selected.name) && (
          <Link
            href={`/characters/${characterSlug(selected.name)}`}
            className={styles.lightboxShare}
          >
            Character page
          </Link>
        )}
        {isAdmin && (
          <div className={styles.lightboxAdmin}>
            <select
              aria-label="Category"
              className={styles.lightboxAdminButton}
              value={selected.category}
              onChange={(e) => onCategoryChange(selected, e.target.value as CharacterCategory)}
            >
              {CHARACTER_CATEGORIES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {adminState === "categoryError" && <span role="alert">Category change failed</span>}
            <button
              type="button"
              className={styles.lightboxAdminButton}
              disabled={adminState === "purging" || adminState === "regenerating"}
              onClick={() => onRegenerate(selected)}
            >
              {adminState === "regenerating"
                ? "Regenerating..."
                : adminState === "regenError"
                  ? "Regenerate failed, retry"
                  : "Regenerate portrait"}
            </button>
            <button
              type="button"
              className={`${styles.lightboxAdminButton} ${styles.lightboxPurge}`}
              disabled={adminState === "purging" || adminState === "regenerating"}
              onClick={() => onPurge(selected)}
            >
              {adminState === "confirm"
                ? "Click again to purge"
                : adminState === "purging"
                  ? "Purging..."
                  : adminState === "purgeError"
                    ? "Purge failed, retry"
                    : "Purge portrait"}
            </button>
          </div>
        )}
        <button type="button" className={styles.lightboxClose} aria-label="Close" onClick={onClose}>
          &times;
        </button>
      </>
    )}
  </dialog>
);

export default GalleryLightbox;
