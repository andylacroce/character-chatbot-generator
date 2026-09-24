"use client";

/**
 * Lists a signed-in user's saved characters (`GET /api/bots`), newest first. Each row
 * links to `/?name=<name>` — the same launch point the Character Wall uses, which
 * already resumes a signed-in user's saved character by that name (see BotCreator.tsx),
 * so there's no separate resume path to keep in sync. Guests get a sign-in prompt.
 * Each row can be deleted, or the whole list cleared (`DELETE /api/bots`), behind a
 * confirmation; the matching local chat data goes with it.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FaTrashAlt } from "react-icons/fa";
import { authenticatedFetch } from "../../utils/api";
import { hasNavigatedWithinSession } from "../../utils/clientNavigationState";
import { formatRelativeTime } from "../../utils/formatRelativeTime";
import { clearStoredBot, getValidBotFromStorage } from "../../utils/getValidBotFromStorage";
import { removeItem, removeItemsWhere } from "../../utils/storage";
import AppHeader from "./AppHeader";
import ConfirmDialog from "./ConfirmDialog";
import BackHomeLink from "./BackHomeLink";
import type { PersistedBot } from "./BotCreator";
import { useAccountMenu } from "./useAccountMenu";
import styles from "./styles/History.module.css";
import {
  CLEAR_HISTORY_CONFIRM,
  DELETE_CHAT_CONFIRM,
  chatStorageKeys,
  displayCharacterName,
  isChatHistoryStorageKey,
} from "character-chatbot-shared";

/** Deletes saved chats server-side (one by id, or all), throwing on failure. */
async function deleteSavedChats(id?: string) {
  const url = id ? `/api/bots?id=${encodeURIComponent(id)}` : "/api/bots";
  const res = await authenticatedFetch(url, { method: "DELETE" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/** Full-page list of the signed-in user's saved characters. */
export default function HistoryPage() {
  const router = useRouter();
  const { status } = useSession();
  const { menuItems, modals, requestSignIn } = useAccountMenu();
  const [bots, setBots] = useState<PersistedBot[] | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PersistedBot | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const deleteOne = async () => {
    const bot = pendingDelete!;
    await deleteSavedChats(bot.id);
    chatStorageKeys(bot.name).forEach(removeItem);
    if (getValidBotFromStorage()?.name === bot.name) clearStoredBot();
    setBots((prev) => prev?.filter((b) => b.id !== bot.id) ?? prev);
    setPendingDelete(null);
  };

  const clearAll = async () => {
    await deleteSavedChats();
    removeItemsWhere(isChatHistoryStorageKey);
    setBots([]);
    setConfirmClearAll(false);
  };

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
          <li key={b.id} className={styles.item}>
            <Link href={`/?name=${encodeURIComponent(b.name)}`} className={styles.row}>
              {/* eslint-disable-next-line @next/next/no-img-element -- avatars may be data URLs */}
              <img src={b.avatarUrl || "/silhouette.svg"} alt="" className={styles.avatar} />
              <span className={styles.name}>{displayCharacterName(b.name)}</span>
              <span className={styles.time}>{formatRelativeTime(b.updatedAt)}</span>
            </Link>
            <button
              type="button"
              className={styles.deleteButton}
              aria-label={`Delete chat with ${displayCharacterName(b.name)}`}
              title="Delete chat"
              onClick={() => setPendingDelete(b)}
            >
              <FaTrashAlt size={14} />
            </button>
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
        <div className={styles.heading}>
          <h1>Past Chats</h1>
          {bots && bots.length > 0 && (
            <button
              type="button"
              className={styles.clearButton}
              onClick={() => setConfirmClearAll(true)}
            >
              Clear all chats
            </button>
          )}
        </div>
        {body}
      </main>
      <ConfirmDialog
        show={pendingDelete !== null}
        copy={{
          ...DELETE_CHAT_CONFIRM,
          title: DELETE_CHAT_CONFIRM.title.replace(
            "{name}",
            pendingDelete ? displayCharacterName(pendingDelete.name) : "",
          ),
        }}
        onConfirm={deleteOne}
        onClose={() => setPendingDelete(null)}
      />
      <ConfirmDialog
        show={confirmClearAll}
        copy={CLEAR_HISTORY_CONFIRM}
        onConfirm={clearAll}
        onClose={() => setConfirmClearAll(false)}
      />
    </div>
  );
}
