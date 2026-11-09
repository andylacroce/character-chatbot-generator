"use client";

/**
 * Public archival-mosaic gallery of every character portrait in the shared
 * avatar cache (see pages/api/chars.ts). Portraits are presented as an aged
 * parchment-backed mosaic rather than a conventional application grid.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  CHARACTER_CATEGORIES,
  getCharacterCategoryLabel,
  type CharacterCategory,
} from "character-chatbot-shared";
import AppHeader from "../common/AppHeader";
import { BackLink } from "../common/BackLink";
import { useAccountMenu } from "../account/useAccountMenu";
import styles from "../styles/CharsPage.module.css";
import { SORT_OPTIONS, type GalleryGroup, type GallerySort } from "./charsGalleryHelpers";
import PortraitMosaic from "./PortraitMosaic";
import GalleryLightbox from "./GalleryLightbox";
import { useGalleryPages } from "./useGalleryPages";
import { useGalleryLightbox } from "./useGalleryLightbox";
import { useBackToTop } from "./useBackToTop";

/** Public /characters gallery: paginated, infinite-scroll mosaic of recognized portraits. */
const CharsGallery: React.FC<{ initialCharacterName?: string }> = ({ initialCharacterName }) => {
  const { menuItems, modals, isAdmin } = useAccountMenu();
  const [sortBy, setSortBy] = useState<GallerySort>("newest");
  const [groupBy, setGroupBy] = useState<GalleryGroup>("none");
  const [expandedGroups, setExpandedGroups] = useState<Set<CharacterCategory>>(() => new Set());
  const {
    characters,
    setCharacters,
    initialLoad,
    loadingMore,
    error,
    resetGalleryQuery,
    sentinelCallbackRef,
  } = useGalleryPages(sortBy, groupBy);
  const {
    dialogRef,
    selected,
    adminState,
    openLightbox,
    closeLightbox,
    handleDialogClose,
    purgePortrait,
    regeneratePortrait,
  } = useGalleryLightbox(setCharacters, initialCharacterName);
  const { showBackToTop, topMarkerRef, scrollToTop } = useBackToTop();

  const toggleGroup = useCallback((category: CharacterCategory) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const galleryGroups = useMemo(() => {
    if (groupBy === "none") return [{ key: "all", label: "", entries: characters }];

    return CHARACTER_CATEGORIES.map(({ value, label }) => ({
      key: value,
      label,
      entries: characters.filter((entry) => entry.category === value),
    })).filter(({ entries }) => entries.length > 0);
  }, [characters, groupBy]);

  return (
    <>
      <div
        ref={topMarkerRef}
        className={styles.topMarker}
        data-testid="gallery-top-marker"
        aria-hidden="true"
      />
      <AppHeader menuItems={menuItems} left={<BackLink />} />
      {modals}
      <div className={styles.page}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>Portrayal &nbsp;·&nbsp; The living collection</p>
          <h1 className={styles.title}>The Character Wall</h1>
          <div className={styles.flourish} aria-hidden="true">
            <span />
            <b>✦</b>
            <span />
          </div>
          <p className={styles.subtitle}>
            An ever-growing archive of imagined lives, gathered one portrait at a time.
          </p>
        </div>

        <div className={styles.controls} aria-label="Gallery arrangement">
          <label className={styles.control}>
            <span>Sort by</span>
            <select
              value={sortBy}
              onChange={(event) => {
                resetGalleryQuery();
                setSortBy(event.target.value as GallerySort);
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.groupToggle}>
            <input
              className={styles.toggleInput}
              type="checkbox"
              checked={groupBy === "category"}
              onChange={(event) => {
                resetGalleryQuery();
                setExpandedGroups(new Set());
                setGroupBy(event.target.checked ? "category" : "none");
              }}
            />
            <span className={styles.switchTrack} aria-hidden="true">
              <span />
            </span>
            <span className={styles.toggleLabel}>Group by category</span>
          </label>
        </div>

        {error && characters.length === 0 && (
          <p className={styles.state}>
            Couldn&apos;t load the gallery right now — try again in a bit.
          </p>
        )}
        {!error && initialLoad && <p className={styles.state}>Loading portraits&hellip;</p>}
        {!initialLoad && characters.length === 0 && !error && (
          <p className={styles.state}>No characters yet — go create the first one!</p>
        )}

        {characters.length > 0 && (
          <>
            <div className={styles.groupedGallery}>
              {galleryGroups.map((group) => (
                <section key={group.key} className={styles.galleryGroup}>
                  {group.label ? (
                    <>
                      <button
                        type="button"
                        className={styles.groupHeading}
                        aria-expanded={expandedGroups.has(group.key as CharacterCategory)}
                        aria-controls={`gallery-group-${group.key}`}
                        onClick={() => toggleGroup(group.key as CharacterCategory)}
                      >
                        <span className={styles.groupTitle}>
                          {getCharacterCategoryLabel(group.key)}
                        </span>
                        <span className={styles.groupChevron} aria-hidden="true">
                          ›
                        </span>
                      </button>
                      {expandedGroups.has(group.key as CharacterCategory) && (
                        <div id={`gallery-group-${group.key}`}>
                          <PortraitMosaic
                            entries={group.entries}
                            groupLabel={group.label}
                            onOpen={openLightbox}
                          />
                        </div>
                      )}
                    </>
                  ) : (
                    <PortraitMosaic entries={group.entries} onOpen={openLightbox} />
                  )}
                </section>
              ))}
            </div>
            <div ref={sentinelCallbackRef} className={styles.sentinel} aria-hidden="true" />
            {loadingMore && <p className={styles.loadingMore}>Loading more&hellip;</p>}
          </>
        )}

        <GalleryLightbox
          dialogRef={dialogRef}
          selected={selected}
          isAdmin={isAdmin}
          adminState={adminState}
          onClose={closeLightbox}
          onDialogClose={handleDialogClose}
          onRegenerate={(entry) => void regeneratePortrait(entry)}
          onPurge={(entry) => void purgePortrait(entry)}
        />
      </div>
      {characters.length > 0 && (
        <button
          type="button"
          className={`${styles.toTop} ${showBackToTop ? styles.toTopVisible : ""}`.trim()}
          aria-label="Back to top"
          aria-hidden={!showBackToTop}
          tabIndex={showBackToTop ? 0 : -1}
          onClick={scrollToTop}
        >
          <span className={styles.toTopArrow} aria-hidden="true">
            &uarr;
          </span>
          <span className={styles.toTopLabel} aria-hidden="true">
            To top
          </span>
        </button>
      )}
    </>
  );
};

export default CharsGallery;
