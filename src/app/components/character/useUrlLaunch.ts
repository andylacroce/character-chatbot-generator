import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authenticatedFetch } from "../../../utils/api";
import { hasNavigatedWithinSession } from "../../../utils/clientNavigationState";
import { persistedBotToBot, type Bot, type PersistedBot } from "./botTypes";

// How long the "Resuming..." / "Starting a new chat..." interstitial stays up
// before actually dispatching, so the user has time to read which outcome
// happened rather than jumping straight into chat with no visible signal.
const INTERSTITIAL_DELAY_MS = 1500;

/** The "Resuming…" / "Starting…" screen shown before a URL-driven launch dispatches. */
export interface Interstitial {
  name: string;
  kind: "resume" | "new";
  dispatch: () => void;
}

interface UseUrlLaunchOptions {
  input: string;
  setInput: (value: string) => void;
  /** True while validation or generation is running. */
  isBusy: boolean;
  error: string;
  returningToCreator: boolean;
  sessionStatus: "loading" | "authenticated" | "unauthenticated";
  handleCreate: () => unknown;
  handleCancel: () => void;
  onBotCreated: (bot: Bot) => void;
}

/**
 * Handles launching straight into a chat from `/?name=X` (e.g. the /characters "Chat with
 * this character" link, or a Past chats row): pre-fills the name, resumes a signed-in
 * user's own saved character of that name if one exists (otherwise creates a fresh one),
 * and shows the interstitial before dispatching.
 */
export function useUrlLaunch({
  input,
  setInput,
  isBusy,
  error,
  returningToCreator,
  sessionStatus,
  handleCreate,
  handleCancel,
  onBotCreated,
}: UseUrlLaunchOptions) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nameFromUrl = searchParams?.get("name") || null;

  // Set once the user cancels a URL-driven launch (see handleCancelLaunch). Read by
  // isLaunchingFromUrl and the URL-launch effect's own guard below so cancelling is
  // immediate and deterministic — it doesn't depend on router.push('/characters') having
  // actually completed its navigation (and thus unmounted this component) before some
  // other render/effect tick could otherwise let the launch silently resume.
  const [launchCancelled, setLaunchCancelled] = useState(false);
  const [interstitial, setInterstitial] = useState<Interstitial | null>(null);

  // Launching via /?name=X should read as going straight into a chat, not "landing on
  // the creator page, which then happens to fill itself in" — so the ordinary
  // hero/input/footer UI stays hidden for as long as a URL-driven launch is in flight.
  // Falls back to showing the normal form (pre-filled, with the error visible) if that
  // launch actually fails, so the user isn't left stuck looking at a spinner with no way
  // to retry or edit the name. Also false once the user cancels (launchCancelled).
  const isLaunchingFromUrl =
    Boolean(nameFromUrl) && !error && !returningToCreator && !launchCancelled;

  // Guard flag only — never read by the render output, so a ref (not state) avoids an
  // unnecessary extra render on top of the one handleCreate() itself already triggers.
  const hasAutoSubmittedRef = useRef<boolean>(false);
  // useBotCreation doesn't memoize its return values, so handleCreate/onBotCreated
  // get a new identity on every render. The URL-launch effect below reads
  // them through these refs instead of listing them as effect dependencies — otherwise
  // any unrelated re-render while the /api/bots lookup is in flight would tear down and
  // re-fire the effect, and since the lookup hadn't dispatched yet, the StrictMode-hang-fix
  // cleanup below would reset the
  // guard and fire a duplicate /api/bots request — repeatedly, on every such re-render.
  const handleCreateRef = useRef(handleCreate);
  const onBotCreatedRef = useRef(onBotCreated);
  useEffect(() => {
    handleCreateRef.current = handleCreate;
    onBotCreatedRef.current = onBotCreated;
  });

  // Runs the deferred dispatch (onBotCreated for a resumed character, or
  // handleCreate for a fresh one) after the interstitial has been visible for
  // a beat. Cancelled on unmount or if superseded by a new interstitial before
  // it fires.
  useEffect(() => {
    if (!interstitial) return;
    const timer = window.setTimeout(() => {
      interstitial.dispatch();
      setInterstitial(null);
    }, INTERSTITIAL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [interstitial]);

  // Backs all the way out of the current launch — whichever step it's clicked
  // from — and returns to wherever that launch actually started. Shared by the
  // interstitial's Cancel button, the validating-step Cancel button, and the
  // downstream generation-progress Cancel button, so cancelling always "kicks
  // out" the same way instead of only unwinding whichever single step happened
  // to be showing. handleCancel() (from useBotCreation) stops an in-flight
  // generation run if one exists; it's a harmless no-op when cancelling
  // straight out of the interstitial before generation ever started.
  //
  // A launch with no nameFromUrl started on this same landing-page form —
  // clearing `interstitial` is enough, since the ordinary form is already what
  // re-appears once isBusy/interstitial are both false, no navigation needed. A
  // launch WITH nameFromUrl came from another page (the Character Wall, Past
  // Chats, or the landing backdrop's name pill), so cancelling goes Back to it; a direct
  // hard-load of /?name=X has no in-app Back target and falls back to /characters.
  // Setting launchCancelled makes isLaunchingFromUrl false immediately, for
  // this mounted instance, regardless of how long the navigation takes
  // to actually complete its navigation — it doesn't rely on that navigation
  // having unmounted the component yet to stop the launch from resuming.
  const handleCancelLaunch = () => {
    handleCancel();
    setInterstitial(null);
    if (nameFromUrl) {
      setLaunchCancelled(true);
      if (hasNavigatedWithinSession()) router.back();
      else router.push("/characters");
    }
  };

  useEffect(() => {
    if (nameFromUrl && !input.trim()) {
      setInput(nameFromUrl);
    }
  }, [nameFromUrl, input, setInput]);

  useEffect(() => {
    if (returningToCreator) {
      setInput("");
    }
  }, [returningToCreator, setInput]);

  // Launching /?name=X (e.g. from the /characters "Chat with this character" link) should
  // resume a signed-in user's own saved character by that name if one exists (this is
  // also how /history's rows resume) — rather than always generating a fresh (and likely different) personality for a name that's already
  // been created. Falls back to a fresh handleCreate() for guests, or when no saved
  // match exists. Waits out sessionStatus === 'loading' so guests aren't misjudged
  // as signed-in before the session resolves.
  useEffect(() => {
    if (
      !nameFromUrl ||
      input !== nameFromUrl ||
      hasAutoSubmittedRef.current ||
      isBusy ||
      returningToCreator ||
      launchCancelled
    )
      return;
    if (sessionStatus === "loading") return;
    hasAutoSubmittedRef.current = true;

    if (sessionStatus !== "authenticated") {
      handleCreateRef.current();
      return;
    }

    // Tracks whether this invocation actually dispatched onBotCreated/handleCreate
    // before its cleanup ran — see the cleanup comment below for why that matters.
    let dispatched = false;
    authenticatedFetch("/api/bots")
      .then((res) => res.json())
      .then((data) => {
        const bots: PersistedBot[] = Array.isArray(data?.bots) ? data.bots : [];
        const match = bots.find((b) => b.name.toLowerCase() === nameFromUrl.toLowerCase());
        dispatched = true;
        if (match) {
          setInterstitial({
            name: match.name,
            kind: "resume",
            dispatch: () => onBotCreatedRef.current(persistedBotToBot(match)),
          });
        } else {
          setInterstitial({
            name: nameFromUrl,
            kind: "new",
            dispatch: () => handleCreateRef.current(),
          });
        }
      })
      .catch(() => {
        dispatched = true;
        setInterstitial({
          name: nameFromUrl,
          kind: "new",
          dispatch: () => handleCreateRef.current(),
        });
      });

    return () => {
      // React 18 Strict Mode runs every effect twice in dev (mount, cleanup,
      // mount again) without resetting refs in between. If this cleanup fires
      // while the /api/bots lookup above is still in flight (dispatched still
      // false), the *next* invocation would see hasAutoSubmittedRef already
      // true and bail immediately — and the in-flight lookup, once it does
      // resolve, has no way back into a component that already gave up
      // waiting for it. Net effect: nobody ever calls onBotCreated/
      // handleCreate, and the launch hangs on the loading screen forever.
      // Releasing the guard here (only when nothing was dispatched yet) lets
      // the next invocation actually retry the lookup for real. Once
      // `dispatched` is true, leave the guard alone — deliberately allows
      // that in-flight lookup to finish and dispatch normally instead of
      // racing a second one.
      if (!dispatched) {
        hasAutoSubmittedRef.current = false;
      }
    };
  }, [nameFromUrl, input, isBusy, returningToCreator, sessionStatus, launchCancelled]);

  return { nameFromUrl, isLaunchingFromUrl, interstitial, handleCancelLaunch };
}
