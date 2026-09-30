/**
 * Shared SSE staged-progress plumbing for the guessing games' round-generation calls
 * (POST /api/{game}/start and /continue). Both games' endpoints stream the same
 * `data: {"stage": ..., "done": false}` frames from utils/game/round.ts's progress-stage
 * shape, so one implementation serves both (see useGameController.ts).
 */

import type { LoadingStage } from "./CharacterLoadingOverlay";
import { authenticatedFetch } from "../../utils/api";

/**
 * The real stages a round-generation endpoint reports as it runs, in display order,
 * plus a trailing synthetic entry standing in for the final TTS-synthesis step (the
 * server never reports it by name — it's simply whatever's left once the other four are
 * done, right up until the last frame arrives).
 */
export const ROUND_STAGE_ORDER: { stage: string; label: string }[] = [
  { stage: "personality", label: "Creating personality…" },
  { stage: "avatar", label: "Generating portrait…" },
  { stage: "reply", label: "Writing opening line…" },
  { stage: "voice", label: "Selecting voice…" },
  { stage: "greeting", label: "Preparing greeting…" },
];

/** The checklist's starting state: nothing done yet, the first stage active. */
export function initialRoundStages(): LoadingStage[] {
  return ROUND_STAGE_ORDER.map((entry, index) => ({
    ...entry,
    done: false,
    active: index === 0,
  }));
}

/**
 * Reads a `text/event-stream` response of `data: {...}\n\n` frames, calling `onFrame` for
 * each as it arrives. A malformed frame is skipped rather than aborting the whole stream.
 */
export async function readSseFrames(
  response: Response,
  onFrame: (frame: Record<string, unknown>) => void,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        onFrame(JSON.parse(line.slice("data:".length).trim()));
      } catch {
        // Skip a malformed frame rather than aborting the whole stream.
      }
    }
  }
}

/**
 * Calls a round-generation endpoint in streamed mode, reporting REAL progress to
 * `onProgress` as each named step genuinely completes — not a client-side timer
 * simulating stages. `completedStages` accumulates as real "done" events arrive; the
 * active stage is always the first one in ROUND_STAGE_ORDER not yet completed, which
 * naturally reflects personality/avatar (and reply/voice, which run concurrently in
 * pairs server-side) resolving in either order. The synthetic trailing "greeting" stage
 * is never in `completedStages` (the server doesn't report it by name), so it naturally
 * becomes "active" once the real four are done and stays that way until the final frame
 * resolves the whole call, returning that final frame for the caller to validate
 * (createGameTransport's parseGameRoundResult). The mobile app can't read a streamed
 * body, so it calls the same endpoints in plain JSON mode instead.
 */
export async function fetchRoundWithProgress(
  url: string,
  body: Record<string, unknown>,
  onProgress: (label: string, stages: LoadingStage[]) => void,
): Promise<Record<string, unknown>> {
  const completedStages = new Set<string>();
  const updateProgress = () => {
    const activeIndex = ROUND_STAGE_ORDER.findIndex((entry) => !completedStages.has(entry.stage));
    const stages = ROUND_STAGE_ORDER.map((entry, index) => ({
      ...entry,
      done: completedStages.has(entry.stage),
      active: index === activeIndex,
    }));
    onProgress(stages[activeIndex]?.label ?? "Preparing greeting…", stages);
  };
  updateProgress();

  const res = await authenticatedFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  let finalFrame: Record<string, unknown> | null = null;
  await readSseFrames(res, (frame) => {
    if (frame.done) {
      finalFrame = frame;
      return;
    }
    if (typeof frame.stage === "string") {
      completedStages.add(frame.stage);
      updateProgress();
    }
  });

  if (!finalFrame) throw new Error(`Stream from ${url} ended without a final frame`);
  return finalFrame;
}
