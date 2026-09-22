"use client";

/** Lets a top-ten player choose or remove a moderated public display name. */

import { useEffect, useState, type FormEvent } from "react";
import { authenticatedFetch } from "../../src/utils/api";
import styles from "./styles/Leaderboard.module.css";

interface Settings {
  available: boolean;
  eligible: boolean;
  showOnLeaderboard: boolean;
  name: string | null;
}

/** Shows a name form only when this account or guest browser owns a top-ten score. */
export default function LeaderboardClaim({ onChange }: { onChange?: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    authenticatedFetch("/api/game/leaderboard-settings")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load leaderboard settings");
        return res.json();
      })
      .then((data: Settings) => {
        if (mounted) {
          setSettings(data);
          setName(data.name ?? "");
        }
      })
      .catch(() => {
        if (mounted) setError("Could not load your leaderboard settings.");
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!settings)
    return error ? (
      <p role="alert" className={styles.error}>
        {error}
      </p>
    ) : null;
  if (!settings.available || !settings.eligible) return null;

  /** Saves the submitted name after the server verifies the score and checks the name. */
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await authenticatedFetch("/api/game/leaderboard-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOnLeaderboard: true, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save your name");
      setSettings(data);
      setName(data.name ?? "");
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your name");
    } finally {
      setSaving(false);
    }
  };

  /** Removes this player from the public list while retaining their private high score. */
  const leave = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await authenticatedFetch("/api/game/leaderboard-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showOnLeaderboard: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not leave the leaderboard");
      setSettings(data);
      onChange?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not leave the leaderboard");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.claim} aria-label="Your leaderboard entry">
      <h2>You made the top 10!</h2>
      <p>
        Choose the name shown publicly with your best streak. Your account identity stays private.
      </p>
      <form onSubmit={save} className={styles.claimForm}>
        <label htmlFor="leaderboard-name">Leaderboard name</label>
        <input
          id="leaderboard-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          minLength={2}
          maxLength={30}
          required
          autoComplete="off"
        />
        <button type="submit" disabled={saving}>
          {settings.showOnLeaderboard ? "Update name" : "Join leaderboard"}
        </button>
      </form>
      {settings.showOnLeaderboard && (
        <button type="button" className={styles.leaveButton} onClick={leave} disabled={saving}>
          Remove my name
        </button>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </section>
  );
}
