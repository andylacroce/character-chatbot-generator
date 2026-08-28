"use client";

// =============================
// Providers.tsx
// Client-side context provider wrapper for the root layout. SessionProvider
// (next-auth/react) has to be composed inside an explicit "use client" boundary
// rather than rendered directly from the Server Component root layout — doing
// it inline there breaks static prerendering of "/" with "React Context is
// unavailable in Server Components", even though SessionProvider is itself a
// client component internally.
// =============================

import React from "react";
import { SessionProvider } from "next-auth/react";

const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <SessionProvider>{children}</SessionProvider>;
};

export default Providers;
