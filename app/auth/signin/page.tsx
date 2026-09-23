/** NextAuth's configured sign-in page (see authOptions.ts's `pages.signIn`). */

import { Suspense } from "react";
import AuthSignInPage from "../../components/AuthSignInPage";

export const metadata = {
  title: "Sign in — Portrayal",
  description: "Sign in with Google or email to save your characters and chat history.",
};

export default function Page() {
  // AuthSignInPage reads `callbackUrl`/`error` via useSearchParams(), which requires a
  // Suspense boundary to statically prerender — unlike app/page.tsx's use of the same
  // hook, nothing else on this page is already forcing dynamic rendering.
  return (
    <Suspense>
      <AuthSignInPage />
    </Suspense>
  );
}
