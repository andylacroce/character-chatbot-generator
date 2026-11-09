import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared Anthropic API client singleton.
 * All API routes and utilities should import this instead of constructing their own instances.
 */
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export default anthropic;
