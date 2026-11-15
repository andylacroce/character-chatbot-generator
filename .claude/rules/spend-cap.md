---
paths:
  - "src/utils/claude/spendGuard.ts"
  - "src/utils/claude/claudeModelSelector.ts"
  - "src/utils/chat/chatReply.ts"
  - "src/utils/game/gameReply.ts"
  - "src/app/api/chat/route.ts"
  - "src/app/api/*/message/route.ts"
---

### Global daily spend cap (`src/utils/claude/spendGuard.ts`)

A ceiling on the `text` tier (Sonnet in production: chat replies and game clue replies), the app's only
meaningful Claude cost.

- **How it counts.** After each `text` call, `recordTextUsage` adds `input_tokens + 5 x output_tokens`
  (weighted tokens; the 5 approximates Sonnet's output/input price ratio) to a Redis counter
  `spend:text:<UTC date>` (2 day TTL). Without Redis it is a per-process map. Streamed chat sums the
  `message_start`/`message_delta` usage; non-streamed calls read `response.usage`. Calls downgraded to
  Haiku past the soft limit are still recorded at these weights, so after the soft limit the counter
  runs ahead of real spend (conservative). In development the `text` tier is Haiku and counts the same.
- **How it enforces.** Every `text` call site gets its model and `thinking` setting from
  `textCallSettings()`, never `getClaudeModel("text")` directly (Haiku and Sonnet need different
  `thinking` values, so they travel together). At or past `DAILY_TEXT_SOFT_LIMIT` it returns Haiku
  (`spend_cap_soft`, warn). At or past `DAILY_TEXT_HARD_LIMIT` it throws `SpendCapError`
  (`spend_cap_hard`, error). A new `text` call site must use `textCallSettings()` and `recordTextUsage()`.
- **What users see at the hard cap.**
  - `/api/chat` answers 503 `{ reply, code: "spend_cap", requestId }`. The shared client
    (`packages/shared/src/chat.ts`) does not retry it (`isRetryable`) and shows "Chat is resting for
    today" (`chatErrorMessage`), on web and mobile. A `stream: true` request gets a final
    `{ error, done: true }` frame, but no first-party client streams chat.
  - `/api/[game]/message` answers 503 only for a clue reply (`getGameReply`, which runs before any turn
    claim, so the token is untouched). Guesses, give-up, start and continue keep working: classification
    and verdict reactions are Haiku, and `getOpeningReply` falls back to canned text. The game client
    shows "Questions are resting for today" on a 503 (`useGameSession.ts`).
- **Config.** Both limits are weighted tokens, unset by default, and independent (either unset
  disables that stage). Weighted tokens x Sonnet's input price per token is the day's approximate cost.
- **Fails open.** A store outage or a Redis call over 2 seconds (`redisPipeline`'s timeout) logs
  `spend_store_failed`/`spend_record_failed` and lets requests through, the same convention as the
  rate limiter. Each of the four `spend_*` events logs at most once per instance per UTC day
  (`logOncePerDay`), so alert on the event existing, not on its count.

**Worst case (do not oversell this as a hard guarantee):**

- **Overshoot.** The check runs before a call and the usage is recorded after it, so requests in
  flight when the limit is crossed all finish. Overshoot is about concurrent requests x the cost of one
  reply (chat caps at 500 output tokens, games at 220; a game clue can make two calls when the
  hidden-name guard regenerates). Input tokens (system prompt plus up to 20 history lines) are usually
  the larger share.
- **Uncounted spend.** Billed but never recorded: a streamed reply that errors or is aborted partway,
  and a call whose response never arrives. `text-simple` Haiku calls are never metered (classification,
  personas, summaries, voice casting, avatar prompts, moderation, leaderboard names, guess reactions),
  and they still run at the hard cap (the summarizer before a capped chat, the classifier before a
  capped clue, every round start).
- **No cap when:** Redis is unreachable or slow (fails open); no Redis is attached (the count is per
  instance, so the ceiling is the limit x warm instances); or the env vars are unset.
- **So:** set the hard limit to the daily budget minus a 10 to 20 percent margin, and keep an Anthropic
  console spend limit as the independent backstop. Per-IP rate limits remain the second layer.
