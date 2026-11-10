import React from "react";
import Link from "next/link";
import { BRAND } from "character-chatbot-shared";
import styles from "../styles/BotCreator.module.css";

/** The landing page's animated wordmark, kicker, headline, and one-line pitch. */
export function LandingHero() {
  return (
    <div className={styles.hero}>
      <div className={styles.brandLine}>
        <p className={styles.heroWordmark} aria-hidden="true">
          {"Portrayal".split("").map((ch, i) => (
            <span key={i} className={styles.heroLetter} style={{ animationDelay: `${i * 0.045}s` }}>
              {ch}
            </span>
          ))}
        </p>
        <span className={styles.betaBadge}>{BRAND.betaLabel}</span>
      </div>
      <p className={styles.kicker}>Create a conversation</p>
      <h1 id="creator-heading" className={styles.headline}>
        Who will you bring to life?
      </h1>
      <p className={styles.heroCopy}>Talk with someone from history, mythology, or fiction.</p>
    </div>
  );
}

/** The "Play a game" panel linking to both guessing games. */
export function GamesPanel() {
  return (
    <aside className={styles.playPanel} aria-labelledby="play-heading">
      <p className={styles.gamesBandEyebrow}>Play a game</p>
      <h2 id="play-heading" className={styles.playHeading}>
        Test your character knowledge
      </h2>
      <div className={styles.gamesBand} data-testid="games-invitation-band">
        <Link href="/guess-who" className={styles.gamesBandHalf}>
          <span className={styles.gamesBandTitle}>Guess Who</span>
          <span className={styles.gamesBandHook}>
            Chat with a mystery character and name who it is.
          </span>
          <span className={styles.gamesBandCta}>Play &rarr;</span>
        </Link>
        <Link href="/guess-who-next" className={styles.gamesBandHalf}>
          <span className={styles.gamesBandTitle}>Guess Who&apos;s Next</span>
          <span className={styles.gamesBandHook}>
            Chat with a character who is hinting at someone else.
          </span>
          <span className={styles.gamesBandCta}>Play &rarr;</span>
        </Link>
      </div>
    </aside>
  );
}

interface LandingFooterLinksProps {
  authenticated: boolean;
  onShowCharacterInfo: () => void;
  onShowDisclaimer: () => void;
}

/** Footer links: Past chats (signed in), supported characters, disclaimer, privacy. */
export function LandingFooterLinks({
  authenticated,
  onShowCharacterInfo,
  onShowDisclaimer,
}: LandingFooterLinksProps) {
  return (
    <div className={`${styles.footerLinks} ${authenticated ? styles.footerLinksDense : ""}`.trim()}>
      {authenticated && (
        <Link href="/history" className={styles.footerLink}>
          Past chats
        </Link>
      )}
      <button
        type="button"
        aria-label="Which characters can I create?"
        onClick={onShowCharacterInfo}
        className={styles.footerLink}
      >
        <span className={styles.footerLabelFull}>Which characters can I create?</span>
        <span className={styles.footerLabelShort}>Characters</span>
      </button>
      <button
        type="button"
        aria-label="Read disclaimer"
        onClick={onShowDisclaimer}
        className={styles.footerLink}
      >
        Disclaimer
      </button>
      <Link href="/privacy" className={styles.footerLink}>
        Privacy
      </Link>
    </div>
  );
}
