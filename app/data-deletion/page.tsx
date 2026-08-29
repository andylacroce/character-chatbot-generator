/**
 * Data deletion instructions page.
 * @module DataDeletionPage
 */

import styles from "../components/styles/LegalPage.module.css";

export const metadata = {
  title: "Data Deletion — Character Chatbot Generator",
  description: "How to request deletion of your Character Chatbot Generator account and data.",
};

export default function DataDeletionPage() {
  return (
    <div className={styles.page}>
      <a href="/" className={styles.back}>&larr; Back to Character Chatbot Generator</a>
      <h1 className={styles.title}>Data Deletion Instructions</h1>
      <p className={styles.updated}>Last updated: August 2026</p>

      <div className={styles.section}>
        <p>
          If you&apos;ve used this app only as a guest (never signed in), there&apos;s nothing to
          request — your character and chat history live only in your own browser&apos;s local
          storage. Clearing your browser&apos;s site data for this app removes it immediately and
          completely; we never had a copy.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>If you signed in with Google or Facebook</h2>
        <p>
          To request deletion of your account, saved characters, and chat history, email{" "}
          <a href="mailto:andy.lacroce@gmail.com?subject=Data%20deletion%20request">andy.lacroce@gmail.com</a>{" "}
          from the email address you signed in with, with the subject line{" "}
          <strong>&quot;Data deletion request&quot;</strong>. Include the name you signed in with
          if you can, to help us find the right account.
        </p>
        <div className={styles.callout}>
          We&apos;ll delete your account record, every character you saved, and your full chat
          history within 30 days, and confirm by email once it&apos;s done.
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
      </div>

      <div className={styles.section}>
        <p>
          See our full <a href="/privacy">Privacy Policy</a> for more on what we collect and why.
        </p>
      </div>
    </div>
  );
}
