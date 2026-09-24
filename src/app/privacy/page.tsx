/**
 * Privacy policy page.
 * @module PrivacyPage
 */

import Link from "next/link";
import { AnalyticsPreferences } from "../components/GoogleAnalyticsConsent";
import styles from "../components/styles/LegalPage.module.css";

export const metadata = {
  title: "Privacy Policy — Portrayal",
  description: "How Portrayal collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <Link href="/" className={styles.back}>
        &larr; Back to Portrayal
      </Link>
      <h1 className={styles.title}>Privacy Policy</h1>
      <p className={styles.updated}>Last updated: September 24, 2026</p>

      <div className={styles.section}>
        <p>
          Portrayal is an educational/portfolio project built and operated by an individual
          developer, not a company. This policy explains what information the app collects, why, and
          how you can have it deleted.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Using the app without an account</h2>
        <p>
          You do not need an account to use this app. As a guest, the character you create and your
          conversation with it are stored only in your own browser (local storage) and are never
          saved to our servers. Closing your browser, clearing site data, or switching devices will
          lose that history, exactly as you&apos;d expect from browser-only storage. The one
          exception is the guessing game, which tracks a guest&apos;s best streak server-side — see{" "}
          <strong>Guessing game</strong> below.
        </p>
        <p>
          Regardless of whether you&apos;re signed in, the text you send is sent to Anthropic&apos;s
          Claude API to generate the character&apos;s reply, and, if voice replies are enabled, to
          Google Cloud&apos;s Text-to-Speech service to synthesize audio. See{" "}
          <strong>Third-party services</strong> below.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Information we collect if you sign in</h2>
        <p>Signing in with Google is optional. If you sign in, we store:</p>
        <ul>
          <li>
            <strong>Account info</strong>: the name, email address, and profile image your sign-in
            provider shares with us.
          </li>
          <li>
            <strong>Characters you create</strong>: name, personality description, generated
            portrait, and voice settings.
          </li>
          <li>
            <strong>Chat history</strong>: messages exchanged with your saved characters, so a
            conversation can continue across devices and browser sessions.
          </li>
          <li>
            <strong>Your preferred name</strong>: if you tell a character what to call you, we save
            that too, so it follows you across devices the same as your characters and chat history.
          </li>
        </ul>
        <p>
          This lets your saved characters and chat history follow you across devices, instead of
          being trapped in one browser&apos;s local storage. If you never sign in, none of this
          applies to you.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Guessing game</h2>
        <p>
          The guessing game (/game) works a little differently from ordinary chat. Whether
          you&apos;re signed in or playing as a guest, we store your best streak for that game
          server-side, since the public leaderboard needs somewhere to compare scores from. A guest
          is identified only by a random token in a browser cookie (see <strong>Cookies</strong>{" "}
          below) — never by anything that identifies you personally.
        </p>
        <p>
          Joining the public leaderboard is entirely optional. If you opt in, your chosen display
          name (screened by Claude before it&apos;s published) and best streak are shown publicly;
          leaving the leaderboard removes the public name while keeping your private best score.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Cookies</h2>
        <p>We use two functional cookies:</p>
        <ul>
          <li>
            <strong>Sign-in session</strong> (if you sign in): an encrypted session cookie set by
            our authentication provider, so you stay signed in between visits.
          </li>
          <li>
            <strong>Guessing game guest identity</strong>: a random token, not tied to your name,
            email, or any other personal information, that lets us track a guest&apos;s best streak
            for the leaderboard described above. Set only if you play the guessing game as a guest.
          </li>
        </ul>
        <p>
          If you explicitly allow analytics, Google Analytics and tags managed through Google Tag
          Manager may also set analytics cookies that help us count visits and understand page
          navigation. These are disabled unless you opt in, and you can change that choice below at
          any time. We do not use advertising cookies.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Analytics choices</h2>
        <p>
          Google Analytics and Tag Manager are optional. Whether you allow or decline them, the rest
          of the app works the same. Changing your choice takes effect immediately for future
          collection.
        </p>
        <AnalyticsPreferences />
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Third-party services</h2>
        <p>Depending on how you use the app, your data may be processed by:</p>
        <ul>
          <li>
            <strong>Anthropic</strong> — generates in-character replies from your messages.
          </li>
          <li>
            <strong>Google Cloud</strong> — synthesizes voice audio (Text-to-Speech) only.
          </li>
          <li>
            <strong>Google</strong> — if you choose to sign in, for authentication only.
          </li>
          <li>
            <strong>Google Analytics and Google Tag Manager</strong> — only if you opt in, load the
            site&apos;s analytics tags and receive page URLs and basic device, browser, and
            approximate-location information so we can understand site traffic. Portrayal never
            pushes your chat text, character names, or guesses into the tag data layer.
          </li>
          <li>
            <strong>Cloudflare</strong> — renders character portraits (Workers AI), when configured.
          </li>
          <li>
            <strong>Pollinations.ai</strong> — a free, anonymous third-party image service that
            renders character portraits when Cloudflare isn&apos;t available. It requires no account
            and receives only the image description, never your identity.
          </li>
          <li>
            <strong>Neon</strong> — hosts the database that stores signed-in users&apos; accounts,
            characters, and chat history.
          </li>
          <li>
            <strong>Vercel</strong> — hosts the app, stores generated avatar images, and provides
            basic, non-advertising traffic analytics (page views and performance, not individual
            tracking or ad targeting).
          </li>
        </ul>
        <p>
          Each of these providers has its own privacy policy governing how it handles data it
          processes on our behalf.
        </p>
        <p>
          We also keep a small internal log of product-usage events (e.g. how many characters are
          created, whether a guess was correct) for our own analytics. It never includes chat text,
          character names, or guesses — only counts and outcome labels.
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
          If you signed in, your account, saved characters, and chat history are kept until you ask
          us to delete them. See our <a href="/data-deletion">data deletion instructions</a> for how
          to request that.
        </p>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Children&apos;s privacy</h2>
        <p>
          This app is not directed at children under 13, and we do not knowingly collect information
          from them.
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
          <a href="mailto:portrayal-support@andrewlacroce.com">
            portrayal-support@andrewlacroce.com
          </a>
          .
        </p>
      </div>
    </div>
  );
}
