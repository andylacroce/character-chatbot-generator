/**
 * Branded magic-link email, replacing next-auth's generic default template (which
 * reads "Sign in to <raw host>" — e.g. the Vercel deployment URL rather than the
 * product name — on a plain gray/blue template that doesn't match the app at all).
 * Colors/fonts are copied from app/globals.css's CSS variables rather than imported,
 * since email HTML can't reach app styles at send time and most clients strip
 * external stylesheets/@import anyway — keep this in sync by hand if the palette
 * in globals.css changes.
 */

import { createTransport } from "nodemailer";
import type { SendVerificationRequestParams } from "next-auth/providers/email";

const brand = {
  background: "#f7f4ef", // --color-background
  cardBackground: "#ffffff", // --color-surface
  text: "#18160f", // --color-text
  textSecondary: "#5c5245", // --color-text-secondary
  outline: "#9c8f7d", // --color-outline
  primary: "#af5a3f", // --color-primary
  onPrimary: "#ffffff", // --color-on-primary
};

const fontFamily = "'Inter', -apple-system, Segoe UI, Helvetica, Arial, sans-serif";

/** Sends the magic-link sign-in email, styled to match Portrayal's palette/fonts. */
export async function sendVerificationRequest(
  params: SendVerificationRequestParams,
): Promise<void> {
  const { identifier, url, provider } = params;
  const transport = createTransport(provider.server);
  const result = await transport.sendMail({
    to: identifier,
    from: provider.from,
    subject: "Sign in to Portrayal",
    text: textBody(url),
    html: htmlBody(url),
  });
  const failed = (result.rejected ?? []).concat(result.pending ?? []).filter(Boolean);
  if (failed.length) {
    throw new Error(`Email (${failed.join(", ")}) could not be sent`);
  }
}

/** Renders the branded HTML body for the magic-link email. */
function htmlBody(url: string): string {
  return `
<body style="margin:0; padding:0; background:${brand.background}; font-family:${fontFamily};">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background:${brand.background};">
    <tr>
      <td align="center" style="padding: 40px 16px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 480px; background:${brand.cardBackground}; border: 1px solid ${brand.outline}; border-radius: 12px;">
          <tr>
            <td align="center" style="padding: 32px 32px 8px;">
              <div style="font-size: 22px; font-weight: 700; color: ${brand.primary};">Portrayal</div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 8px 32px 0; font-size: 16px; line-height: 1.6; color: ${brand.text};">
              Click below to sign in.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 24px 32px;">
              <a href="${url}" target="_blank" style="display:inline-block; padding: 12px 28px; font-size: 16px; font-weight: 600; color: ${brand.onPrimary}; background: ${brand.primary}; border-radius: 8px; text-decoration: none;">
                Sign in
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 0 32px 32px; font-size: 13px; line-height: 1.5; color: ${brand.textSecondary};">
              This link expires in 24 hours and can only be used once. If you didn&rsquo;t request it, you can safely ignore this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>`;
}

/** Renders the plain-text fallback body for the magic-link email. */
function textBody(url: string): string {
  return `Sign in to Portrayal\n\n${url}\n\nThis link expires in 24 hours and can only be used once. If you didn't request it, you can safely ignore this email.\n`;
}
