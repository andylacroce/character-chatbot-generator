// =============================
// src/utils/api.ts
// Utility for making API requests. proxy.ts authenticates by origin, so no key is sent.
// =============================

/**
 * Makes a fetch request. proxy.ts authenticates the caller by origin (see its doc comment).
 * @param url - The URL to fetch.
 * @param options - Fetch options.
 * @returns The fetch response.
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(url, options);
}
