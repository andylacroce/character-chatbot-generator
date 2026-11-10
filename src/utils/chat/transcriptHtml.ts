import { escapeHtml, sanitizeForDisplay } from "../server/security";
import { displayCharacterName } from "character-chatbot-shared/src/core";

/**
 * Palette, type pairing (Inter for labels, Playfair Display for titles, Lora for the actual
 * readable message body) and "no bubbles" transcript treatment mirror the live chat page's
 * immersive-stage design (ChatMessage.module.css, globals.css) so a downloaded transcript still
 * looks like this app. Unlike the live app, this stays on the light palette always (no
 * dark-mode media query) since a downloaded/printed document should stay print-friendly rather
 * than follow the viewer's OS theme.
 */
const TRANSCRIPT_STYLES = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@400;500;600;700&family=Lora:wght@400;500;600&display=swap');

        :root {
          --color-background: #f7f4ef;
          --color-surface-variant: #efe6de;
          --color-outline: #9c8f7d;
          --color-text: #18160f;
          --color-text-secondary: #5c5245;
          --color-accent: #3d6e73;
        }

        * {
          box-sizing: border-box;
        }
        body {
          font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem 1.25rem 4rem;
          background-color: var(--color-background);
          color: var(--color-text);
        }
        h1 {
          font-family: 'Playfair Display', 'Inter', serif;
          font-weight: 500;
          font-size: 1.65rem;
          color: var(--color-text);
          text-align: center;
          margin-bottom: 0.5rem;
        }
        h2 {
          font-family: 'Playfair Display', 'Inter', serif;
          font-weight: 500;
          font-size: 1.3rem;
          color: var(--color-text);
          text-align: center;
          margin-top: 0.65rem;
        }
        .header-info {
          text-align: center;
          color: var(--color-text-secondary);
          font-size: 0.9rem;
          margin-bottom: 2rem;
        }
        .header-info strong {
          color: var(--color-text);
        }
        .character-image {
          display: block;
          margin: 0 auto;
          width: 120px;
          height: 120px;
          border-radius: 50%;
          object-fit: cover;
          background: var(--color-surface-variant);
          border: 3px solid var(--color-accent);
        }
        .messages {
          margin-top: 1rem;
        }
        .message {
          padding: 1rem 0;
          border-bottom: 1px solid var(--color-outline);
          line-height: 1.5;
        }
        .message:last-child {
          border-bottom: none;
        }
        .bot-message {
          border-left: 2px solid var(--color-accent);
          padding-left: 1rem;
        }
        .user-message {
          padding-left: 1rem;
        }
        .message strong {
          display: block;
          font-family: 'Inter', sans-serif;
          font-weight: 700;
          font-size: 0.7rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 0.4rem;
        }
        .user-sender {
          color: var(--color-text-secondary);
        }
        .bot-sender {
          color: var(--color-accent);
        }
        .bot-message .message-text {
          display: block;
          font-family: 'Lora', 'Inter', serif;
          font-size: 1.25rem;
          line-height: 1.5;
          color: var(--color-text);
        }
        .user-message .message-text {
          display: block;
          font-family: 'Inter', sans-serif;
          font-size: 1rem;
          color: var(--color-text-secondary);
          max-width: 60ch;
        }
        .bot-header {
          margin-bottom: 2rem;
        }
        @media print {
          body {
            padding: 0;
          }
          .message {
            break-inside: avoid;
          }
        }
`;

/**
 * Helper function to validate avatar URL format for security.
 *
 * Scheme detection is done on the `scheme:` prefix rather than on `://`, because
 * scheme-only URLs such as `javascript:alert(1)` have no authority component and
 * would otherwise be mistaken for a relative path and rendered as-is.
 */
export function isValidAvatarUrl(url: string): boolean {
  if (typeof url !== "string" || url === "") return false;
  // Allow absolute paths starting with /
  if (url.startsWith("/")) return true;
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(url);
  // Allow relative URLs without a scheme (e.g., 'silhouette.svg')
  if (!hasScheme) return true;
  // Generated avatars are inlined as base64 image data URLs by /api/generate-avatar.
  // SVG is excluded: it is the one image type that can carry markup of its own.
  if (/^data:image\/(?:png|jpe?g|gif|webp|avif);base64,/i.test(url)) return true;
  // For full URLs, validate the protocol is safe
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** A transcript's character, as the client sends it. */
export interface TranscriptBot {
  name: string;
  avatarUrl: string;
}

/** One chat line in a transcript. */
export interface TranscriptMessage {
  sender: string;
  text: string;
}

/**
 * Renders messages as a styled, self-contained HTML document. Every piece of user-supplied
 * text is HTML-escaped (or run through `sanitizeForDisplay`) before it is interpolated.
 */
export function renderTranscriptHtml(options: {
  filename: string;
  displayTimestamp: string;
  bot?: TranscriptBot | null;
  messages: TranscriptMessage[];
  senderName: string;
}): string {
  const { filename, displayTimestamp, bot, messages, senderName } = options;
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${filename}</title>
      <style>${TRANSCRIPT_STYLES}</style>
    </head>
    <body>
      <h1>Portrayal Transcript</h1>
      <div class="header-info">
        <p><strong>Exported:</strong> ${escapeHtml(displayTimestamp) /* nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format -- escaped before HTML interpolation */}</p>
      </div>
      ${
        bot
          ? `
        <div class="bot-header">
          ${isValidAvatarUrl(bot.avatarUrl) ? `<img src="${escapeHtml(bot.avatarUrl)}" alt="${escapeHtml(bot.name)}" class="character-image" />` : ""}
          <h2>${escapeHtml(displayCharacterName(bot.name)) /* nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format -- escaped before HTML interpolation */}</h2>
        </div>
      `
          : ""
      }
      <div class="messages">
        ${messages
          .map((msg: { sender: string; text: string }) => {
            const isUser = msg.sender === "User";
            return `
              <div class="message ${isUser ? "user-message" : "bot-message"}">
                <strong class="${isUser ? "user-sender" : "bot-sender"}">${isUser ? escapeHtml(senderName) : escapeHtml(displayCharacterName(bot ? bot.name : msg.sender)) /* nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format -- both branches are escaped before HTML interpolation */}:</strong>
                <span class="message-text">${sanitizeForDisplay(msg.text) /* nosemgrep: javascript.express.security.injection.raw-html-format.raw-html-format -- sanitizer returns HTML-escaped text */}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    </body>
    </html>
  `;
}

/** The default "Exported" label when the client doesn't send one: now, in the server's locale. */
export function defaultExportTimestamp(now: Date = new Date()): string {
  return now.toLocaleString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short",
  });
}

/** The download's file name, stamped with the local date and time. */
export function transcriptFilename(now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const datetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `Character Chat Transcript ${datetime}.html`;
}
