import { useState, useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useSession as useAuthSession } from "next-auth/react";
import { authenticatedFetch } from "../../../utils/api";
import type { Message } from "../../../types/message";
import { longerHistory, parseChatMessages } from "character-chatbot-shared";

/**
 * Reconciles the chat with server-persisted history (phase 3c). Local storage stays the
 * fast, instant-load cache for the common case; the server is the durable source of truth
 * for a signed-in user's saved character. Only adopts the server's list when it's strictly
 * longer than what's already loaded — the new-device / cleared-storage case — so this
 * never regresses a longer local list and never blocks the initial render. Guests (no
 * session) and a character that was never saved server-side both just get [] back from
 * the endpoint, a no-op.
 *
 * Returns `historyReconciled`, which gates the intro-generation effect: without it, a
 * signed-in user resuming a saved character on a device with no local cache would see
 * messages.length === 0 for the instant between mount and this fetch resolving, firing
 * a bogus "Introduce yourself" turn that then gets persisted server-side on top of the
 * character's real history — the exact bug this gate exists to prevent.
 */
export function useServerHistoryReconcile(
  botName: string,
  setMessages: Dispatch<SetStateAction<Message[]>>,
): boolean {
  const { status: authStatus } = useAuthSession();
  const [historyReconciled, setHistoryReconciled] = useState(
    authStatus !== "loading" && authStatus !== "authenticated",
  );

  /* eslint-disable react-hooks/set-state-in-effect -- authStatus is client-only auth
       session state; this effect can only run post-mount. */
  useEffect(() => {
    if (authStatus !== "loading" && authStatus !== "authenticated") {
      setHistoryReconciled(true);
      return;
    }
    // A signed-in user's server history hasn't been checked yet for this (possibly new)
    // bot. While auth is still loading we don't know yet whether there's history to wait for.
    setHistoryReconciled(false);
    if (authStatus === "loading") return;
    let mounted = true;
    authenticatedFetch(`/api/messages?botName=${encodeURIComponent(botName)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!mounted || !Array.isArray(data?.messages)) return;
        const serverMessages = parseChatMessages(data.messages);
        setMessages((current) => longerHistory(current, serverMessages));
      })
      .catch(() => {
        // Best-effort — local storage already has whatever this device has seen.
      })
      .finally(() => {
        if (mounted) setHistoryReconciled(true);
      });
    return () => {
      mounted = false;
    };
  }, [botName, authStatus, setMessages]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return historyReconciled;
}
