/**
 * Root layout component that provides the HTML structure and analytics for the application.
 * @module RootLayout
 */

import React from "react";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { DarkModeProvider } from "./components/DarkModeContext";

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
  return (
    // suppressHydrationWarning avoids noisy hydration-mismatch errors when
    // browser extensions (e.g. Dark Reader) inject attributes into the
    // server-rendered HTML that don't exist on the client.
    <html lang="en" className="" suppressHydrationWarning>
      <head>
        <title>Character Chatbot Generator</title>
        <meta name="description" content="Create and chat with your own AI-powered characters." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/dexter.webp" type="image/webp" />
        {/* Open Graph / Facebook */}
        <meta property="og:title" content="Character Chatbot Generator" />
        <meta property="og:description" content="Create and chat with your own AI-powered characters." />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="/dexter.webp" />
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Character Chatbot Generator" />
        <meta name="twitter:description" content="Create and chat with your own AI-powered characters." />
        <meta name="twitter:image" content="/dexter.webp" />
      </head>
      <body>
        <DarkModeProvider>
          {/* Removed .container wrapper to allow sticky positioning to work */}
          {children}
          <Analytics />
          <SpeedInsights />
        </DarkModeProvider>
      </body>
    </html>
  );
};

export default RootLayout;
