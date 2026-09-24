/**
 * Data deletion instructions page.
 * @module DataDeletionPage
 */

import Link from "next/link";
import styles from "../components/styles/LegalPage.module.css";

export const metadata = {
  title: "Data Deletion — Portrayal",
  description: "How to request deletion of your Portrayal account and data.",
};

export default function DataDeletionPage() {
  return (
    <div className={styles.page}>
      <Link href="/" className={styles.back}>
        &larr; Back to Portrayal
      </Link>
      <h1 className={styles.title}>Data Deletion Instructions</h1>
      <p className={styles.updated}>Last updated: September 2026</p>

      <div className={styles.section}>
        <p>
          If you&apos;ve used this app only as a guest (never signed in), there&apos;s nothing to
          request — your character and chat history live only in your own browser&apos;s local
          storage. Clearing your browser&apos;s site data for this app removes it immediately and
          completely; we never had a copy.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>If you signed in with Google</h2>
        <p>
          To request deletion of your account, saved characters, and chat history, email{" "}
          <a href="mailto:portrayal-support@andrewlacroce.com?subject=Data%20deletion%20request">
            portrayal-support@andrewlacroce.com
          </a>{" "}
          from the email address you signed in with, with the subject line{" "}
          <strong>&quot;Data deletion request&quot;</strong>. Include the name you signed in with if
          you can, to help us find the right account.
        </p>
        <div className={styles.callout}>
          We&apos;ll delete your account record, every character you saved, your full chat history,
          and your guessing-game history (including your leaderboard name and score, if you opted
          in) within 30 days, and confirm by email once it&apos;s done.
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>What isn&apos;t affected</h2>
        <p>
          Character portraits are cached and shared across all users by character name to keep
          image-generation costs down — that shared cache isn&apos;t tied to your identity and
          isn&apos;t part of your personal data, so it isn&apos;t deleted as part of an account
          deletion request. It contains no information about you.
        </p>
        <p>
          Aggregate, anonymous usage counts (e.g. how many characters were created on a given day)
          aren&apos;t tied to your identity in a way that can be un-scrambled, so they aren&apos;t
          part of a deletion request either.
        </p>
      </div>

      <div className={styles.section}>
        <p>
          See our full <a href="/privacy">Privacy Policy</a> for more on what we collect and why.
        </p>
      </div>
    </div>
  );
}
