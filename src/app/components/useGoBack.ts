"use client";

import type React from "react";
import { useRouter } from "next/navigation";
import { hasNavigatedWithinSession } from "../../utils/clientNavigationState";

/**
 * The one "Back" rule for pages reachable from several places: return to the previous in-app
 * page, or to the landing page when this tab has no in-app history (a deep link or reload).
 */
export function useGoBack(): React.MouseEventHandler<HTMLAnchorElement> {
  const router = useRouter();
  return (event) => {
    event.preventDefault();
    if (hasNavigatedWithinSession()) router.back();
    else router.push("/");
  };
}
