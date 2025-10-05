// =============================
// src/utils/api.ts
// Utility for making API requests. No longer needs API key for allowed origins.
// =============================

/**
 * Makes a fetch request. API key authentication is handled by middleware based on origin.
 * @param url - The URL to fetch.
 * @param options - Fetch options.
 * @returns The fetch response.
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    // No longer sending API key header - middleware validates based on origin
    return fetch(url, options);
}