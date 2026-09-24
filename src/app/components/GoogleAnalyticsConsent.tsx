"use client";

import React, { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { GoogleAnalytics } from "@next/third-parties/google";
import { STORAGE_KEYS } from "character-chatbot-shared";
import storage from "../../utils/storage";
import styles from "./styles/GoogleAnalyticsConsent.module.css";

type AnalyticsConsent = "granted" | "denied";
type AnalyticsConsentSnapshot = AnalyticsConsent | "loading" | null;

const CONSENT_CHANGE_EVENT = "portrayal:google-analytics-consent-change";
const GOOGLE_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/i;

/** Reads the visitor's persisted Google Analytics choice, ignoring unknown values. */
function readAnalyticsConsent(): AnalyticsConsent | null {
  const stored = storage.getItem(STORAGE_KEYS.googleAnalyticsConsent);
  return stored === "granted" || stored === "denied" ? stored : null;
}

/** Subscribes to consent changes made in this tab or another browser tab. */
function subscribeToAnalyticsConsent(onStoreChange: () => void): () => void {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEYS.googleAnalyticsConsent) onStoreChange();
  };

  window.addEventListener(CONSENT_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", handleStorage);
  };
}

/** Returns the current consent state without reading browser storage during SSR. */
function useAnalyticsConsent(): AnalyticsConsentSnapshot {
  return useSyncExternalStore(subscribeToAnalyticsConsent, readAnalyticsConsent, () => "loading");
}

/** Persists a consent choice and notifies every mounted consent control in this tab. */
function saveAnalyticsConsent(consent: AnalyticsConsent): void {
  storage.setItem(STORAGE_KEYS.googleAnalyticsConsent, consent);
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}

/** Enables or disables collection immediately when a visitor changes an existing choice. */
function setGoogleAnalyticsDisabled(measurementId: string, disabled: boolean): void {
  (window as unknown as Record<string, boolean>)[`ga-disable-${measurementId}`] = disabled;
}

/** Updates Google's consent state for an already-loaded GA script. */
function updateGoogleConsentMode(granted: boolean): void {
  const analyticsWindow = window as typeof window & { dataLayer?: unknown[] };
  analyticsWindow.dataLayer = analyticsWindow.dataLayer ?? [];
  const pushConsentCommand = function (..._args: unknown[]): void {
    analyticsWindow.dataLayer?.push(arguments);
  };
  pushConsentCommand("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
}

interface GoogleAnalyticsConsentProps {
  measurementId?: string;
}

/** Loads Google Analytics only after opt-in and otherwise presents a consent prompt. */
export default function GoogleAnalyticsConsent({ measurementId }: GoogleAnalyticsConsentProps) {
  const consent = useAnalyticsConsent();
  const normalizedMeasurementId = measurementId?.trim();
  const validMeasurementId =
    normalizedMeasurementId && GOOGLE_MEASUREMENT_ID_PATTERN.test(normalizedMeasurementId)
      ? normalizedMeasurementId
      : undefined;

  useEffect(() => {
    if (!validMeasurementId || consent === "loading") return;
    const granted = consent === "granted";
    updateGoogleConsentMode(granted);
    setGoogleAnalyticsDisabled(validMeasurementId, !granted);
  }, [consent, validMeasurementId]);

  if (!validMeasurementId || consent === "loading") return null;

  return (
    <>
      {consent === "granted" && <GoogleAnalytics gaId={validMeasurementId} />}
      {consent === null && (
        <aside className={styles.banner} aria-label="Analytics preferences">
          <div className={styles.copy}>
            <strong>Help improve Portrayal?</strong>
            <p>
              Allow Google Analytics to measure visits and page navigation. We never send them your
              chat text or character names. See the <Link href="/privacy">privacy policy</Link>.
            </p>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={() => saveAnalyticsConsent("denied")}
            >
              Decline
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => saveAnalyticsConsent("granted")}
            >
              Allow analytics
            </button>
          </div>
        </aside>
      )}
    </>
  );
}

/** Lets a visitor review or change the same analytics choice from the privacy page. */
export function AnalyticsPreferences() {
  const consent = useAnalyticsConsent();
  const status =
    consent === "granted"
      ? "Google Analytics is currently allowed."
      : consent === "denied"
        ? "Google Analytics is currently declined."
        : consent === null
          ? "You have not made an analytics choice yet."
          : "Loading your analytics preference…";

  return (
    <div className={styles.preferences}>
      <p className={styles.status} aria-live="polite">
        {status}
      </p>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.secondaryButton}
          disabled={consent === "denied" || consent === "loading"}
          onClick={() => saveAnalyticsConsent("denied")}
        >
          Decline analytics
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          disabled={consent === "granted" || consent === "loading"}
          onClick={() => saveAnalyticsConsent("granted")}
        >
          Allow analytics
        </button>
      </div>
    </div>
  );
}
