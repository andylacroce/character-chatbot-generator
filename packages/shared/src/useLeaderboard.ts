/**
 * Leaderboard state shared by the web app and the mobile app: the public top-ten list, and
 * the claim flow that lets a top-ten player choose (or remove) their public name. Each
 * platform passes its own request functions; everything else lives here once.
 */

import { useCallback, useEffect, useState } from "react";
import { LEADERBOARD_COPY } from "./gameCopy";
import type {
  LeaderboardEntry,
  LeaderboardSettingsRequest,
  LeaderboardSettingsResponse,
} from "./types";

/** Loads the public top ten; `reload` refreshes it (e.g. after the player joins). */
export function useLeaderboard(fetchEntries: () => Promise<LeaderboardEntry[]>) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setEntries(await fetchEntries());
      setError("");
    } catch {
      setError(LEADERBOARD_COPY.loadError);
    } finally {
      setLoading(false);
    }
    // The fetch function is a stable module-level request on both platforms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // The request updates state only when its response arrives.
    /* eslint-disable react-hooks/set-state-in-effect */
    void reload();
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [reload]);

  return { entries, loading, error, reload };
}

export interface LeaderboardClaimTransport {
  load(): Promise<LeaderboardSettingsResponse>;
  /** Rejects with an Error whose message is safe to show (the server's own reason when it has one). */
  save(request: LeaderboardSettingsRequest): Promise<LeaderboardSettingsResponse>;
}

/**
 * The top-ten name claim. `visible` is false unless this account or device owns a top-ten
 * score; the server re-checks eligibility and moderates the name on every save.
 */
export function useLeaderboardClaim(transport: LeaderboardClaimTransport, onChange?: () => void) {
  const [settings, setSettings] = useState<LeaderboardSettingsResponse | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    transport
      .load()
      .then((data) => {
        if (!mounted) return;
        setSettings(data);
        setName(data.name ?? "");
      })
      .catch(() => {
        if (mounted) setError(LEADERBOARD_COPY.settingsLoadError);
      });
    return () => {
      mounted = false;
    };
    // Loaded once per mount; the transport is stable on both platforms.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (request: LeaderboardSettingsRequest, fallback: string) => {
    setSaving(true);
    setError("");
    try {
      const data = await transport.save(request);
      setSettings(data);
      setName(data.name ?? "");
      onChange?.();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : fallback);
    } finally {
      setSaving(false);
    }
  };

  return {
    settings,
    visible: Boolean(settings?.available && settings.eligible),
    name,
    setName,
    saving,
    error,
    /** Joins (or renames) under the typed name. */
    save: () => submit({ showOnLeaderboard: true, name }, LEADERBOARD_COPY.saveError),
    /** Leaves the public list; the private high score is kept. */
    leave: () => submit({ showOnLeaderboard: false }, LEADERBOARD_COPY.leaveError),
  };
}
