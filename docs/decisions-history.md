# Decisions history

Closed decisions and fully-removed features, kept here for context if ever revisited.
Not needed to understand current behavior — CLAUDE.md links here from the relevant
section rather than carrying the full narrative inline.

## Facebook sign-in (issue #832): built, shipped, then fully removed

Meta's Publish flow gates any app off Development mode behind Meta Business Portfolio
verification, regardless of which login product it registers — in practice this demands
formal business documents (EIN letter, business registration, articles of incorporation,
etc.) an individual developer without a registered business doesn't have. Without
completing that, Facebook sign-in could only ever admit Facebook's own added testers,
never the public. Removed rather than left dark behind a flag — see `authOptions.ts`'s
doc comment and git history around the removal for the exact prior shape if it's ever
worth revisiting (e.g. after completing EIN-based verification).

## Guess Who: clue-list mechanic replaced by a self-describing chat (2026-09-29)

The original "Guess Who" shipped as a static, non-chat mechanic: a single Claude call
generated 5 ordered clues (vague to specific) about a hidden character up front, shown
one at a time in a dedicated "clue card" UI with a separate guess text input and Give Up
button — no persona, no avatar, no TTS during play (an avatar was only ever generated at
the reveal moment, so it could never spoil the guess). This didn't match the game's
original intent: a mystery character the player actually *converses with*, which drops
real clues about itself naturally as the conversation continues, the same way "Guess
Who's Next" already worked except steering toward a *different* hidden figure instead of
describing itself.

Rebuilt on "Guess Who's Next"'s proven chat architecture: the character being chatted
with *is* the mystery (never a separate current/next pair), never states its own name,
and gives escalating real clues about itself as the player asks questions — guesses go
into the same chat box as ordinary messages, classified server-side exactly like the
sibling game. This required generating the full persona/avatar/voice/TTS pipeline eagerly
at round start (for full audio/persona parity with ordinary chat) while withholding the
name and avatar URL from every API response until a reveal — a real design constraint the
old game never had, since it simply never generated an avatar until reveal time. See
CLAUDE.md's "Guess Who (self-describing chat game)" section for the current design; the
shared guess-classifier logic (`classifyGuess`, with all its hard-won identity-matching
rules) was extracted out of "Guess Who's Next" into `src/utils/classifyGuess.ts` as part
of this rework so both games share one implementation instead of risking drift.

## Guessing-game leaderboard: per-run "locked name" mechanism, shipped then removed

A per-run "locked name" mechanism (a `leaderboard_name` column on `game_results`, a
`runId` param on the leaderboard-settings endpoint, a 409 on renaming a claimed run)
shipped alongside the public leaderboard and was removed 2026-09-21 as dead code: no
client component ever tracked or passed a `runId` — `LeaderboardClaim` is only ever
mounted bare, from `GamePage.tsx`'s menu and `/leaderboard` itself — and
`getLeaderboard()` only ever displays one name per account/guest, never a per-run name,
so there was nothing for a per-run lock to protect. Opt-in naming is keyed only by
account/guest identity now; a player can update their public name at any time.
