import type { ThinkingConfigParam } from "@anthropic-ai/sdk/resources/messages";

import { getClaudeModel } from "./claudeModelSelector";

/**
 * The "no up-front thinking" setting for a tier's model. Sonnet 5.5 rejects
 * `{ type: "disabled" }` with a 400 and takes `between_tools` instead; Haiku 5.5 accepts `disabled`.
 */
export function thinkingFor(type: "text" | "text-simple"): ThinkingConfigParam {
  const model = type === "text" ? getClaudeModel("text") : getClaudeModel("text-simple");
  return model.startsWith("claude-sonnet-5-5") ? { type: "between_tools" } : { type: "disabled" };
}
