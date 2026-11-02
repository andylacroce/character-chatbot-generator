---
paths:
  - "scripts/simulate-games.ts"
---

### Game simulator (`npm run sim:games`)

`scripts/simulate-games.ts` plays both games in-process with an LLM player (`--player strong|weak|adversarial`,
`--game`, `--concurrency`, `--max-turns`; **hard-limited to one round per game, concurrency 2, 6 turns by default (10 max), and it refuses to run unless a human sets `ALLOW_PAID_SIM=1`**; the local `.claude/settings.local.json` also denies Claude Code from launching it) and reports
win rate, pacing, wasted turns (an "ambiguous" the player had to repeat), name leaks, and
fourth-wall mentions, writing transcripts to gitignored `sim-output/`. It skips avatar, voice, TTS,
and the DB. **It costs real Anthropic money:** each turn is three or four calls and ~400 rounds
cost enough that the user stopped the work (~230 rounds yielded three real bugs, a leak, a two-name
win and a persona mismatch; most of the spend only confirmed prior findings). Read prompts and scan
name lists first; use real-player data (`analytics_events`, `/admin`) for difficulty questions, since
an LLM player knows far more than a human; one round per game is the cap, and Claude must not run it unprompted. `NODE_ENV=production`
makes chat replies use Sonnet like prod (the classifier is Haiku either way). Findings so far: all
players mostly win and the strong player wins in 2 to 3 turns, so difficulty is the open question.
