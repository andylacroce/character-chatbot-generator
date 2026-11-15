---
paths:
  - "src/utils/claude/spendGuard.ts"
  - "src/utils/chat/chatReply.ts"
  - "src/utils/game/gameReply.ts"
---

### Global daily spend cap (`src/utils/claude/spendGuard.ts`)

A ceiling on the Sonnet `text` tier (chat and game replies), the app's only meaningful Claude cost.

- **How it counts.** After each `text` call, `recordTextUsage` adds `input_tokens + 5 x output_tokens`
  (weighted tokens; the 5 approximates Sonnet's output/input price ratio) to a Redis counter
  `spend:text:<UTC date>` (2 day TTL). Without Redis it is a per-process map. Streamed chat sums the
  `message_start`/`message_delta` usage; non-streamed calls read `response.usage`.
- **How it enforces.** Every `text` call site gets its model and `thinking` setting from
  `textCallSettings()`, never `getClaudeModel("text")` directly (Haiku and Sonnet need different
  `thinking` values, so they travel together). At or past `DAILY_TEXT_SOFT_LIMIT` it returns Haiku
  (`spend_cap_soft`, warn). At or past `DAILY_TEXT_HARD_LIMIT` it throws `SpendCapError`
  (`spend_cap_hard`, error): `/api/chat` answers 503 `{ error: "spend_cap" }` (a stream gets an error
  frame), and `/api/[game]/message` answers 503 after releasing the turn claim so the token is reusable.
  `getOpeningReply` already catches errors and falls back, so rounds still start at the cap. A new
  `text` call site must use `textCallSettings()` and `recordTextUsage()`.
- **Config.** Both limits are weighted tokens, unset by default, and independent (either unset
  disables that stage). Convert from a daily budget with Sonnet's per-token price.
- **Fails open.** A store outage logs `spend_store_failed`/`spend_record_failed` and lets requests
  through, the same convention as the rate limiter.

**Worst case (do not oversell this as a hard guarantee):**

- **Overshoot.** The check runs before a call and the usage is recorded after it, so requests in
  flight when the limit is crossed all finish. Overshoot is about concurrent requests x the cost of one
  reply (chat caps at 500 output tokens, games at 220).
- **Uncounted spend.** A streamed reply that errors or is aborted partway is billed by Anthropic but
  never recorded (usage is added only when the stream completes). Haiku calls (`text-simple`:
  classification, personas, summaries, voice casting) are not metered at all.
- **No cap when:** Redis is unreachable (fails open); no Redis is attached (the count is per instance,
  so the ceiling is the limit x warm instances); or the env vars are unset.
- **So:** set the hard limit to the daily budget minus a 10 to 20 percent margin, and keep an Anthropic
  console spend limit as the independent backstop. Per-IP rate limits remain the second layer.
