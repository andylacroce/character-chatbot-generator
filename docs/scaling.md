# Scaling

What limits this app today, what to change first as traffic grows, and which levers already exist.
Written 2026-11-15 from a code audit; facts below name the file they come from so they can be
re-checked. This is a menu of options ordered by value, not a commitment.

## Where the app stands

- **Stateless where it matters.** Game rounds live in an encrypted token the client holds
  (`src/utils/game/token.ts`), not in a database row, so game traffic scales with serverless
  instances for free. Chat history for signed-in users is in Postgres; guests keep theirs in the
  browser.
- **The database is not a connection bottleneck.** `src/db/client.ts` uses Neon's HTTP driver
  (`drizzle-orm/neon-http`): every query is a stateless request, so hundreds of concurrent function
  instances do not exhaust a connection pool. Watch Neon's compute and storage limits instead.
- **Shared state is small and optional.** Rate-limit counters and the games' single-use turn claims
  use the Upstash-compatible Redis REST store when `KV_REST_API_URL` and `KV_REST_API_TOKEN` are set
  (`src/utils/server/rateLimitStore.ts`, `claimOnce.ts`). Production has it attached since
  2026-11-15. Without it both fall back to per-instance memory.

## What costs money, in order

1. **Chat replies on Sonnet** (`claude-sonnet-5-5` in production, `src/utils/claude/claudeModelSelector.ts`).
   Every message is one Sonnet call plus, usually, one text-to-speech call. This dwarfs everything
   else. Levers, cheapest first:
   - Per-IP limits already exist (chat is 10 per minute per IP) but nothing caps total daily spend.
     Add a global daily budget guard (a Redis counter of estimated tokens; refuse or degrade to Haiku
     past a threshold) before any growth push.
   - Signed-in quotas: guests get a small daily allowance, signed-in users a larger one. The user id
     is already available in `/api/chat` (`resolveChatIdentity`).
   - Serve long conversations with a shorter window or a cheaper model once history is summarized.
     Summarization already folds history past 20 messages (`conversationSummarizer.ts`).
2. **Text to speech.** Each reply is synthesized by Google Cloud TTS. Files are named by a content
   hash, so identical text and voice are reused, but they are written to each instance's temp
   directory (`ttsReply.ts`, `audioFileCleanup.ts`). A request that lands on a different instance
   than the one that synthesized the clip has to synthesize it again (the audio URL carries the text
   for that reason). See "Audio storage" below.
3. **Portraits.** Generated once per character name and cached globally (`avatar_cache`, plus
   Vercel Blob for durable URLs), so cost grows with the number of distinct characters, not users.
4. **Game rounds.** Each round is several Haiku calls, an avatar lookup, and TTS. Rounds are only
   generated on Start and Continue, and Continue replays are now rejected (see below).

## Levers, with when to pull them

### Redis-backed shared state (already done)

Counters and claims are global now. Each rate-limited request costs three Redis commands (SET NX,
INCR, PTTL) and each consumed game turn one or two. Check the Upstash plan's daily command limit
against expected traffic; moving past the free tier is the likely first paid step. If it is ever
exhausted the code fails open (limits stop applying), so alert on the `claim_store_failed` and
rate-limit store log events.

### A global spend cap

Highest value and not built. Sketch: before each Claude call in `chat`, `message`, `start`,
`continue`, add the estimated cost to a Redis counter keyed by UTC day; above a soft limit switch the
`text` tier to Haiku, above a hard limit return 503 with a friendly message. All model selection goes
through `claudeModelSelector.ts`, so the switch is one place.

### Audio storage

Replace per-instance temp files with Vercel Blob keyed by a hash of text and voice, return the Blob
URL directly, and delete the sidecar, cleanup and regeneration code. It removes duplicate synthesis
and makes replays instant, at the price of Blob storage and egress (`BLOB_READ_WRITE_TOKEN` is
already set). Worth doing when the regeneration share of `/api/audio` traffic is measurable and
meaningful. Measure first: compare `audio_voice_selected` (a regeneration) against `audio_sent`
(every serve). Vercel's Hobby plan keeps runtime logs for one hour, so use a log drain, the Pro plan,
or a counter event in `analytics_events` to see more than that.

### Caches that are per instance

- **Chat reply cache** (`src/utils/cache.ts`): in-memory LRU of 1000 entries for 24 hours, so a hit
  depends on landing on a warm instance. Moving it to Redis would make it global; the hit rate for
  conversational text is probably low, so only do it if logs show real `chat_cache_hit` volume.
- **Characters wall list** (`/api/chars`): a 60 second per-instance cache. Fine at current scale;
  a Redis or CDN cache is the next step if the wall becomes the landing page's main load.
- **The Google voice inventory** is fetched once per warm process (`voiceCatalog.ts`).

### Platform plan and function limits

No route sets `maxDuration`, so every function runs at the Vercel default for the plan. Game round
generation and streamed chat are the long-running paths; if they time out under load, set
`maxDuration` on those routes and check the plan allows it. Observability is the other plan limit:
runtime logs are one hour on Hobby.

### Database

On a small Neon plan, compute may suspend when idle, so check the plan for cold-start behavior. The
heavy writers are `messages` (every chat turn for signed-in users, written after the response via
`after()`) and `analytics_events`. Review their indexes against the queries in `src/app/api/messages/route.ts`
and `src/utils/analytics.ts` before growth, and add a retention job for old rows before storage
matters. One database serves
development, preview and production, separated by an `environment` column, so a load test against
preview shares compute with production. Split them before running one.

## Abuse and trust at scale

- **Per-IP limits are not authentication.** `proxy.ts` treats an allowed Origin as proof of a
  first-party browser, which a non-browser client can fake, and the mobile app ships `API_SECRET`
  inside its bundle. The real ceilings are the per-route rate limits and the spend cap above. If
  abuse appears, the strongest single step is requiring sign-in (or a lightweight proof of work or
  bot challenge) on the expensive routes for guests.
- **Personas are server-signed** (see `.claude/rules/chat-tts.md`), so the chat route cannot be used
  as a free general-purpose model with an arbitrary system prompt.
- **Game turns are single-use and tokens expire after a week**, so replay cannot multiply the billed
  calls of a round.

## Watch list

| Signal | Where | Why it matters |
| --- | --- | --- |
| Daily Claude spend | Anthropic console | The only real cost driver |
| Upstash command count | Upstash dashboard | Free-tier limit; limits fail open if it runs out |
| `rate_limit_exceeded` rate | runtime logs | Real users hitting limits, or an abuser |
| `audio_voice_selected` vs `audio_sent` | runtime logs | Duplicate TTS cost (Audio storage) |
| Neon storage and compute hours | Neon console | `messages` and `analytics_events` growth |
| Function duration and timeouts | Vercel dashboard | Game rounds and streamed chat |

## Suggested order

1. A global daily spend cap (protects the bill against any traffic spike).
2. Alerts on the watch list signals above.
3. Signed-in versus guest quotas on chat.
4. Audio storage in Blob, if measurement supports it.
5. Retention for `messages` and `analytics_events`, and separate databases per environment.
