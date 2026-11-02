---
paths:
  - "src/config/serverConfig.ts"
  - "src/utils/classifyGuess.ts"
  - "src/utils/gameReply.ts"
  - "src/utils/character*.ts"
  - "src/pages/api/validate-character.ts"
  - "src/utils/parseClaudeJson.ts"
---

### Prompt engineering conventions

Apply to any *new or edited* system prompt (not a mandate to rewrite existing ones).

- **`"text-simple"` (always Haiku) is the tier most sensitive to prompt quality** (`classifyGuess`,
  `validate-character.ts`, voice config, avatar prompts). Tighten the prompt with the techniques
  below before ever moving a call to a larger tier for accuracy.
- **Few-shot examples are the highest-leverage fix for a wrong judgment call.** Use 3-5 diverse,
  adversarial `<example>` blocks inside one `<examples>` tag, covering the near-misses that
  actually broke in production (see `classifyGuess`'s Edward/Edmund, Hamlet/Laertes,
  Beauty/Cleopatra, Venus/Aphrodite), not just the easy case.
- **Structure multi-part prompts with XML tags** (`<character_persona>`, `<examples>`, ...) so
  instructions, context, and untrusted input are unambiguous.
- **For a structured-JSON judgment call, put an explanation field before the decision field**
  (`{"reasoning": ..., "status": ..., "correct": ...}`): a cheap embedded chain-of-thought.
- **Prefer saying what *to* do, and add a one-line "why" behind non-obvious constraints.**
- **No sampling parameters.** API version 2026-10-21 (SDK 1.x) removed `temperature`, `top_p`,
  and `top_k`; sending any returns a 400, and nothing replaces them. The three judgment calls that
  used `temperature: 0` (`classifyGuess`, `characterClassifier`, `leaderboardName`) instead pass
  `output_config.format` with a JSON schema (enum verdicts, `reasoning`/`reason` ordered before the
  decision), so the verdict is always well-formed and thought through first. Never add `temperature`
  back; tighten the prompt or its few-shot examples if a verdict wobbles.
- **Known gap:** the other `"text-simple"` JSON calls still use "return ONLY JSON" plus regex
  extraction (`src/utils/parseClaudeJson.ts`'s `extractJson`). Not migrated (the one production
  bug, v0.29.4, was `max_tokens` truncating the JSON mid-string, fixed by raising caps; size caps
  for the full JSON, not a typical reply); move a call to `output_config.format` if it proves flaky rather than adding another
  parsing workaround.
- **Ordinary character dialogue never uses an em dash (—).** Every in-character system prompt
  (`chat.ts` replies and all of `src/utils/gameReply.ts`) appends `FORMATTING: Never use an em
  dash (—) anywhere in your reply. Use a comma, period, colon, or parentheses instead.` Stated as
  an explicit negative because Claude's prose defaults lean on em dashes and no positive phrasing
  suppresses them reliably. Not applied to `"text-simple"` classification prompts.
