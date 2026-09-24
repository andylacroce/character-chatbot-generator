/**
 * Root layout component that provides the HTML structure and analytics for the application.
 * @module RootLayout
 */

import React from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { DarkModeProvider, DEFAULT_DARK_MODE } from "./components/DarkModeContext";
import GoogleAnalyticsConsent from "./components/GoogleAnalyticsConsent";
import Providers from "./components/Providers";

const PRODUCTION_GOOGLE_ANALYTICS_ID = "G-W01K2YSWH4";
const PRODUCTION_GOOGLE_TAG_MANAGER_ID = "GTM-WVFLVRGS";

/**
 * Root layout component that wraps the entire application.
 * Provides the HTML document structure, includes Vercel Analytics and Speed Insights,
 * and renders children components within the body.
 *
 * @function
 * @param {Object} props - The component props
 * @param {React.ReactNode} props.children - The child components to render inside the layout
 * @returns {JSX.Element} The HTML document structure with analytics components
 */
const RootLayout = ({ children }: { children: React.ReactNode }) => {
  // VERCEL_ENV, not NODE_ENV: preview deployments and a local `next start` also run with
  // NODE_ENV=production and would otherwise report into the live GA stream.
  const isProductionSite = process.env.VERCEL_ENV === "production";
  const googleAnalyticsId =
    process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID ??
    (isProductionSite ? PRODUCTION_GOOGLE_ANALYTICS_ID : undefined);
  const googleTagManagerId =
    process.env.NEXT_PUBLIC_GOOGLE_TAG_MANAGER_ID ??
    (isProductionSite ? PRODUCTION_GOOGLE_TAG_MANAGER_ID : undefined);

  return (
    // className derives from DarkModeContext's DEFAULT_DARK_MODE so a first-time
    // visitor's server-rendered HTML already has the right theme applied — otherwise
    // they'd see a flash of the other palette before DarkModeProvider mounts and adds
    // the class itself; deriving it here (rather than a separate hardcoded "dark")
    // means changing the default is a one-line edit in exactly one place.
    // suppressHydrationWarning avoids noisy hydration-mismatch errors when browser
    // extensions (e.g. Dark Reader) inject attributes into the server-rendered HTML
    // that don't exist on the client.
    <html lang="en" className={DEFAULT_DARK_MODE ? "dark" : ""} suppressHydrationWarning>
      <head>
        <title>Portrayal</title>
        <meta
          name="description"
          content="Chat with history's greatest minds, legendary heroes, and literary icons."
        />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/palette-icon.svg" type="image/svg+xml" />
        {/* Open Graph / Facebook */}
        <meta property="og:title" content="Portrayal" />
        <meta
          property="og:description"
          content="Chat with history's greatest minds, legendary heroes, and literary icons."
        />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/og-image.png" />
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Portrayal" />
        <meta
          name="twitter:description"
          content="Chat with history's greatest minds, legendary heroes, and literary icons."
        />
        <meta name="twitter:image" content="/og-image.png" />
      </head>
      <body>
        <Providers>
          <DarkModeProvider>
            {/* Removed .container wrapper to allow sticky positioning to work */}
            {children}
            <Analytics />
            <SpeedInsights />
            <GoogleAnalyticsConsent
              measurementId={googleAnalyticsId}
              tagManagerId={googleTagManagerId}
            />
          </DarkModeProvider>
        </Providers>
      </body>
    </html>
  );
};

export default RootLayout;
