"use client";

/**
 * Lets a top-ten player choose or remove a moderated public display name. The claim flow
 * itself is character-chatbot-shared's useLeaderboardClaim, shared with the mobile app.
 */

import type { FormEvent } from "react";
import {
  LEADERBOARD_COPY,
  useLeaderboardClaim,
  type LeaderboardClaimTransport,
  type LeaderboardSettingsResponse,
} from "character-chatbot-shared";
import { authenticatedFetch } from "../../src/utils/api";
import styles from "./styles/Leaderboard.module.css";

const SETTINGS_URL = "/api/game/leaderboard-settings";

const transport: LeaderboardClaimTransport = {
  load: async () => {
    const res = await authenticatedFetch(SETTINGS_URL);
    if (!res.ok) throw new Error(LEADERBOARD_COPY.settingsLoadError);
    return res.json();
  },
  save: async (request) => {
    const res = await authenticatedFetch(SETTINGS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    const data = (await res.json()) as LeaderboardSettingsResponse & { error?: string };
    if (!res.ok) throw new Error(data.error || "");
    return data;
  },
};

/** Shows a name form only when this account or guest browser owns a top-ten score. */
export default function LeaderboardClaim({ onChange }: { onChange?: () => void }) {
  const claim = useLeaderboardClaim(transport, onChange);

  if (!claim.settings)
    return claim.error ? (
      <p role="alert" className={styles.error}>
        {claim.error}
      </p>
    ) : null;
  if (!claim.visible) return null;

  /** Saves the submitted name after the server verifies the score and checks the name. */
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void claim.save();
  };

  return (
    <section className={styles.claim} aria-label="Your leaderboard entry">
      <h2>{LEADERBOARD_COPY.claimTitle}</h2>
      <p>{LEADERBOARD_COPY.claimBody}</p>
      <form onSubmit={save} className={styles.claimForm}>
        <label htmlFor="leaderboard-name">{LEADERBOARD_COPY.claimNameLabel}</label>
        <input
          id="leaderboard-name"
          value={claim.name}
          onChange={(event) => claim.setName(event.target.value)}
          minLength={2}
          maxLength={30}
          required
          autoComplete="off"
        />
        <button type="submit" disabled={claim.saving}>
          {claim.settings.showOnLeaderboard
            ? LEADERBOARD_COPY.updateLabel
            : LEADERBOARD_COPY.joinLabel}
        </button>
      </form>
      {claim.settings.showOnLeaderboard && (
        <button
          type="button"
          className={styles.leaveButton}
          onClick={() => void claim.leave()}
          disabled={claim.saving}
        >
          {LEADERBOARD_COPY.removeLabel}
        </button>
      )}
      {claim.error && (
        <p role="alert" className={styles.error}>
          {claim.error}
        </p>
      )}
    </section>
  );
}
