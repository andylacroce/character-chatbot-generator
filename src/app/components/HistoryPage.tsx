"use client";

/**
 * Lists a signed-in user's saved characters (`GET /api/bots`), newest first. Each row
 * links to `/?name=<name>` — the same launch point the Character Wall uses, which
 * already resumes a signed-in user's saved character by that name (see BotCreator.tsx),
 * so there's no separate resume path to keep in sync. Guests get a sign-in prompt.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { authenticatedFetch } from "../../utils/api";
import { hasNavigatedWithinSession } from "../../utils/clientNavigationState";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import AppHeader from "./AppHeader";
import BackHomeLink from "./BackHomeLink";
import type { PersistedBot } from "./BotCreator";
import { useAccountMenu } from "./useAccountMenu";
import styles from "./styles/History.module.css";
import { displayCharacterName } from "character-chatbot-shared";

/** Full-page list of the signed-in user's saved characters. */
export default function HistoryPage() {
  const router = useRouter();
  const { status } = useSession();
  const { menuItems, modals, requestSignIn } = useAccountMenu();
  const [bots, setBots] = useState<PersistedBot[] | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let mounted = true;
    authenticatedFetch("/api/bots")
      .then((res) => res.json())
      .then((data) => {
        if (mounted) setBots(Array.isArray(data?.bots) ? data.bots : []);
      })
      .catch(() => {
        if (mounted) setBots([]);
      });
    return () => {
      mounted = false;
    };
  }, [status]);

  let body: React.ReactNode;
  if (status === "loading" || (status === "authenticated" && !bots)) {
    body = <p role="status">Loading your chats…</p>;
  } else if (status !== "authenticated") {
    body = (
      <p>
        <button type="button" className={styles.inlineLink} onClick={requestSignIn}>
          Sign in
        </button>{" "}
        to see characters you&apos;ve chatted with.
      </p>
    );
  } else if (bots!.length === 0) {
    body = (
      <p>
        No saved chats yet. <Link href="/">Create a character</Link> to get started.
      </p>
    );
  } else {
    body = (
      <ul className={styles.list}>
        {bots!.map((b) => (
          <li key={b.id}>
            <Link href={`/?name=${encodeURIComponent(b.name)}`} className={styles.row}>
              {/* eslint-disable-next-line @next/next/no-img-element -- avatars may be data URLs */}
              <img src={b.avatarUrl || "/silhouette.svg"} alt="" className={styles.avatar} />
              <span className={styles.name}>{displayCharacterName(b.name)}</span>
              <span className={styles.time}>{formatRelativeTime(b.updatedAt)}</span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className={styles.page}>
      <AppHeader
        menuItems={menuItems}
        left={
          <BackHomeLink
            label="Back"
            icon="back"
            onClick={(event) => {
              event.preventDefault();
              if (hasNavigatedWithinSession()) router.back();
              else router.push("/");
            }}
          />
        }
      />
      {modals}
      <main className={styles.main}>
        <h1>Past Chats</h1>
        {body}
      </main>
    </div>
  );
}
