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

import React, { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { markClientNavigation } from "../../src/utils/clientNavigationState";

/**
 * Marks every pathname change after the first as a real client-side route change —
 * see clientNavigationState.ts for why this (not window.history.length) is what the
 * Character Wall's universal Back control relies on to know whether there's a same-app
 * destination to go back to.
 */
function useTrackClientNavigation(): void {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    if (previousPathname.current !== pathname) {
      markClientNavigation();
      previousPathname.current = pathname;
    }
  }, [pathname]);
}

/** Client-side context provider wrapper (SessionProvider) for the root layout. */
const Providers: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useTrackClientNavigation();
  return <SessionProvider>{children}</SessionProvider>;
};

export default Providers;
