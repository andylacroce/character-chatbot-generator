/**
 * Privacy policy page.
 * @module PrivacyPage
 */

import styles from "../components/styles/LegalPage.module.css";

export const metadata = {
  title: "Privacy Policy — Character Chatbot Generator",
  description: "How Character Chatbot Generator collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <a href="/" className={styles.back}>&larr; Back to Character Chatbot Generator</a>
      <h1 className={styles.title}>Privacy Policy</h1>
      <p className={styles.updated}>Last updated: August 2026</p>

      <div className={styles.section}>
        <p>
          Character Chatbot Generator is an educational/portfolio project built and operated
          by an individual developer, not a company. This policy explains what information
          the app collects, why, and how you can have it deleted.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Using the app without an account</h2>
        <p>
          You do not need an account to use this app. As a guest, the character you create and
          your conversation with it are stored only in your own browser (local storage) and are
          never saved to our servers. Closing your browser, clearing site data, or switching
          devices will lose that history, exactly as you&apos;d expect from browser-only storage.
        </p>
        <p>
          Regardless of whether you&apos;re signed in, the text you send is sent to Anthropic&apos;s
          Claude API to generate the character&apos;s reply, and, if voice replies are enabled,
          to Google Cloud&apos;s Text-to-Speech service to synthesize audio. See{" "}
          <strong>Third-party services</strong> below.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Information we collect if you sign in</h2>
        <p>Signing in with Google is optional. If you sign in, we store:</p>
        <ul>
          <li><strong>Account info</strong>: the name, email address, and profile image your sign-in provider shares with us.</li>
          <li><strong>Characters you create</strong>: name, personality description, generated portrait, and voice settings.</li>
          <li><strong>Chat history</strong>: messages exchanged with your saved characters, so a conversation can continue across devices and browser sessions.</li>
        </ul>
        <p>
          This lets your saved characters and chat history follow you across devices, instead
          of being trapped in one browser&apos;s local storage. If you never sign in, none of this
          applies to you.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Third-party services</h2>
        <p>Depending on how you use the app, your data may be processed by:</p>
        <ul>
          <li><strong>Anthropic</strong> — generates in-character replies from your messages.</li>
          <li><strong>Google Cloud</strong> — synthesizes voice audio (Text-to-Speech) and generates character portraits (Gemini image generation).</li>
          <li><strong>Google</strong> — if you choose to sign in, for authentication only.</li>
          <li><strong>Neon</strong> — hosts the database that stores signed-in users&apos; accounts, characters, and chat history.</li>
          <li><strong>Vercel</strong> — hosts the app, stores generated avatar images, and provides basic, non-advertising traffic analytics (page views and performance, not individual tracking or ad targeting).</li>
        </ul>
        <p>
          Each of these providers has its own privacy policy governing how it handles data it
          processes on our behalf.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>What we don&apos;t do</h2>
        <p>
          We don&apos;t sell your information, use it for advertising, or share it with anyone
          beyond the service providers listed above that are necessary to run the app.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Data retention and deletion</h2>
        <p>
          If you signed in, your account, saved characters, and chat history are kept until you
          ask us to delete them. See our{" "}
          <a href="/data-deletion">data deletion instructions</a> for how to request that.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Children&apos;s privacy</h2>
        <p>
          This app is not directed at children under 13, and we do not knowingly collect
          information from them.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Changes to this policy</h2>
        <p>
          If this policy changes, the &quot;Last updated&quot; date above will change too. Continued
          use of the app after a change means you accept the updated policy.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Contact</h2>
        <p>
          Questions about this policy? Email{" "}
          <a href="mailto:andy.lacroce@gmail.com">andy.lacroce@gmail.com</a>.
        </p>
      </div>
    </div>
  );
}
