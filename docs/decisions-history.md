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

## Guessing-game leaderboard: per-run "locked name" mechanism, shipped then removed

A per-run "locked name" mechanism (a `leaderboard_name` column on `game_results`, a
`runId` param on the leaderboard-settings endpoint, a 409 on renaming a claimed run)
shipped alongside the public leaderboard and was removed 2026-09-21 as dead code: no
client component ever tracked or passed a `runId` — `LeaderboardClaim` is only ever
mounted bare, from `GamePage.tsx`'s menu and `/leaderboard` itself — and
`getLeaderboard()` only ever displays one name per account/guest, never a per-run name,
so there was nothing for a per-run lock to protect. Opt-in naming is keyed only by
account/guest identity now; a player can update their public name at any time.
