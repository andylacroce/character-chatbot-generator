---
paths:
  - "src/utils/game/scores.ts"
  - "src/utils/game/definitions.ts"
  - "src/utils/game/gameGuestIdentity.ts"
  - "src/app/api/*/high-score/route.ts"
  - "src/app/api/*/leaderboard*/route.ts"
  - "packages/shared/src/gameCopy.ts"
---

### Guess Who (self-describing chat game)

`/guess-who` is the default game wherever both appear. The player chats with a mystery character
that never reveals its name and drops escalating real clues about itself. One wrong guess per
round is tolerated; a second ends the run. `generateGuessWhoSelfCluePersonaPrompt(name, work?)`
(`serverConfig.ts`) is the inverse of `generateGameCluePersonaPrompt`: first person, never names
itself, escalates from a broad self-description to specific checkable facts within a couple of
exchanges, grounded in `gameCharacterWork.ts`. Its opening uses `SELF_CLUE_OPENING_INSTRUCTION`
(`gameReply.ts`), never the default "introduce yourself" line (which gave the name away). Scores use
the `guess_who_*` tables; `/leaderboard` shows both top tens as tabs.

### Guess Who's Next (conversation game)

The player chats with a real, NAMED, shown character who talks as itself but steers toward a
*different, hidden* figure. **Don't invert this:** the character you chat with is never the
mystery, and there is no separate guess control; the server classifies every typed message as
`"clear"` guess, `"ambiguous"` (the character asks in character to confirm), `"giveUp"`, or
`"none"` (ordinary question). One wrong guess per hidden target is tolerated; a second ends the
run, or the player gives up (menu or typed) and is always told the answer. A correct guess reveals
the target and holds on "Continue," after which **the revealed figure becomes the new chat partner**
and steers toward a fresh hidden target, building a streak. TTS plays for every reply.

- **`generateGameCluePersonaPrompt(currentCharacterName, nextCharacterName)`** (`serverConfig.ts`)
  reuses `generatePersonalityPrompt` for the speaker and appends rules: steer toward the target
  without naming it; never claim not to know it or refuse it as being from another time/place (the
  pool spans eras and universes); the opening greeting includes one real, narrowing category-level
  fact ("a queen from ancient Egypt"), not pure mood; follow-ups escalate to a specific checkable
  fact by the third or fourth answer, one new clue per reply, and a direct "who is it / who next?"
  gets deflection plus at most one fresh detail (the speaker once nearly named the figure by turn two).
  This was earlier made easier (issue #878, "game is too
  hard"): a contentless hint reads as stalling, and the prompt favors players finishing with long
  streaks over unsolvable rounds.
- **`start.ts`** picks both names, builds persona + avatar + voice, and returns the greeting (with
  audio), the token, and `currentCharacterName`. **`message.ts`** verifies the token, classifies
  (a Haiku classifier that also judges correctness when `"clear"`), then replies normally, asks for
  confirmation, tolerates-once-then-ends on a second wrong guess, or returns the reaction and new
  streak on a correct one.
- **Personal high score:** `guess_who_next_high_scores` (`(user_id, environment)` PK) holds a
  signed-in user's best streak. `updateHighScoreIfBeaten` runs fire-and-forget from `message.ts`'s
  correct branch (a Postgres upsert with a `setWhere` guard `highScore < newStreak`, so a racing
  write can't lower it); it fires once at judgment time, not on Continue. `GET .../high-score`
  returns `{ highScore: null }` with no DB (a guest gets its cookie-bound best from
  `guess_who_next_results`); `useGameController.ts` fetches it once on sign-in and bumps it
  optimistically with `Math.max`, so "Best: N" shows for guests too. **A new table needs `db:push`
  before it works live;** `db:check` treats a wholly-missing table as not-a-drift, so it's easy to
  forget.
- **Public leaderboard:** `guess_who_next_results` has one row per run (`id` = the token's `runId`,
  exactly one of `user_id`/`guest_id`, `environment`-scoped, `bestStreak` raised only via a guarded
  upsert). A guest's identity is a random 32-byte token in the HTTP-only `portrayal-game-guest`
  cookie, SHA-256-hashed before storage (`gameGuestIdentity.ts`; `ensureGuestId` mints at start,
  `getGuestId` only reads). `recordGameResult` runs on the correct branch for signed-in and guest
  runs, only when the token's issuance (`issuedForUserId`/`issuedForGuestId` plus `environment`)
  still matches the caller, so a copied token can't credit anyone. `getLeaderboard` ranks account
  bests plus per-guest bests together (private scores count for ranking only) and publishes only
  the opted-in top ten, one entry per account/guest. Opting in goes through
  `GET`/`POST .../leaderboard-settings`: top-ten eligibility is rechecked server-side and the name
  passes `checkLeaderboardName` (length/script rules plus a Claude moderation call that fails closed
  to `unavailable`). A player can change their public name anytime.
- **Analytics** (`analyticsEvents`): `game_started`, `game_guess_correct`, `game_guess_wrong` (both
  carry `turn`, the round's exchange number, which `/admin` averages as "turns to solve"),
  `game_round_continued`, `game_run_ended` (reason `second_wrong` or `give_up`); see "Internal
  analytics".
