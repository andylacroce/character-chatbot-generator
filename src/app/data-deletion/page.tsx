/**
 * Data deletion instructions page.
 * @module DataDeletionPage
 */

import Link from "next/link";
import styles from "../components/styles/LegalPage.module.css";

export const metadata = {
  title: "Data Deletion — Portrayal",
  description: "How to delete your Portrayal account and data.",
};

export default function DataDeletionPage() {
  return (
    <div className={styles.page}>
      <Link href="/" className={styles.back}>
        &larr; Back to Portrayal
      </Link>
      <h1 className={styles.title}>Data Deletion Instructions</h1>
      <p className={styles.updated}>Last updated: September 24, 2026</p>

      <div className={styles.section}>
        <p>
          If you&apos;ve used this app only as a guest (never signed in), there&apos;s no account to
          delete. Your character and chat history live in your own browser&apos;s local storage, and
          clearing your browser&apos;s site data for this app removes them immediately. For the chat
          troubleshooting logs described below, see <strong>What isn&apos;t affected</strong>.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Deleting individual chats</h2>
        <p>
          If you&apos;re signed in, open <strong>Past chats</strong> (from the menu on the web, or
          the account screen in the mobile app). Use the trash icon next to a character to delete
          that chat, or <strong>Clear all chats</strong> to delete every one. Each asks you to
          confirm first. Deleting a chat erases the saved character, the whole conversation, and any
          portrait made only for it; clearing all chats also erases your chat troubleshooting logs.
          Your account itself stays.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Deleting your account</h2>
        <p>You can delete your account yourself, at any time, from inside the app:</p>
        <ul>
          <li>
            <strong>On the web:</strong> open the menu (the &#9776; icon at the top of any page) and
            choose <strong>Delete account</strong>, then confirm.
          </li>
          <li>
            <strong>In the mobile app:</strong> tap the account icon on the home screen, choose{" "}
            <strong>Delete account</strong>, then confirm.
          </li>
        </ul>
        <div className={styles.callout}>
          Deletion happens immediately once you confirm, and can&apos;t be undone. It erases your
          account record, every character you saved (including portraits made only for your own
          original characters), your full chat history, your preferred name, and your guessing-game
          scores and leaderboard name, and your chat troubleshooting logs. On the browser or device
          you delete from, it also clears your saved chats and the anonymous guessing-game identity,
          and signs you out.
        </div>
        <p>
          Can&apos;t sign in anymore? Email{" "}
          <a href="mailto:portrayal-support@andrewlacroce.com?subject=Data%20deletion%20request">
            portrayal-support@andrewlacroce.com
          </a>{" "}
          from the address you signed in with, with the subject line{" "}
          <strong>&quot;Data deletion request&quot;</strong>, and we&apos;ll delete it for you
          within 30 days and confirm by email.
        </p>
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
        <p>
          Chat troubleshooting logs from guest sessions, or from before September 24, 2026,
          aren&apos;t linked to any account or IP address, so deleting an account can&apos;t find
          them. To have them removed, email{" "}
          <a href="mailto:portrayal-support@andrewlacroce.com?subject=Chat%20log%20deletion%20request">
            portrayal-support@andrewlacroce.com
          </a>{" "}
          with roughly when you chatted and the character&apos;s name, and we&apos;ll delete the
          matching logs within 30 days.
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
