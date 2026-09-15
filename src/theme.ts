/**
 * Brand color tokens and copy shared between the web app (app/globals.css,
 * app/darkmode.css) and the mobile client (which has no CSS custom-properties
 * mechanism, so these need to exist as plain JS values somewhere both can read).
 * The web app still hand-maintains its own CSS copies of these — see
 * character-chatbot-mobile/CLAUDE.md's "production web app has NOT been migrated"
 * note — so keep the two in sync by eye until/unless the web app migrates to
 * import from here directly.
 */

/** Light-mode palette — mirrors app/globals.css's `:root` block. */
export const lightColors = {
  background: "#f7f4ef",
  surface: "#ffffff",
  surfaceVariant: "#f1ddd3",
  outline: "#9c8f7d",
  text: "#18160f",
  textSecondary: "#5c5245",
  primary: "#af5a3f",
  onPrimary: "#ffffff",
  primaryContainer: "#f1ddd3",
  secondary: "#33595e",
  onSecondary: "#ffffff",
  secondaryContainer: "#dbe7e6",
  accent: "#3d6e73",
  error: "#8b3a3a",
  errorContainer: "#f2ddd8",
  warning: "#b8863f",
} as const;

/** Dark-mode palette — mirrors app/darkmode.css's `.dark` block. */
export const darkColors = {
  background: "#151209",
  surface: "#211d15",
  surfaceVariant: "#2c2620",
  outline: "#9c8f7d",
  text: "#f5f1ea",
  textSecondary: "#bcae9a",
  primary: "#d68a6c",
  onPrimary: "#18160f",
  primaryContainer: "#8a4630",
  secondary: "#7bb0b5",
  onSecondary: "#12211f",
  secondaryContainer: "#2c5257",
  accent: "#8fc4c8",
  error: "#c97a72",
  errorContainer: "#6b2f2f",
  warning: "#dab06a",
} as const;

export type ThemeColors = Record<keyof typeof lightColors, string>;

/** In-app wordmark/hero copy — mirrors BotCreator.tsx's hero section exactly. */
export const BRAND = {
  name: "Portrayal",
  kicker: "Begin a conversation",
  headline: "Who will you bring to life?",
} as const;
