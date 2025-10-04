// =============================
// src/utils/api.ts
// Utility for making authenticated API requests with API key header.
// =============================

const apiSecret = process.env.NEXT_PUBLIC_API_SECRET;
if (!apiSecret) {
    throw new Error('Missing NEXT_PUBLIC_API_SECRET environment variable');
}

/**
 * Makes a fetch request with the API key header added.
 * @param url - The URL to fetch.
 * @param options - Fetch options.
 * @returns The fetch response.
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    headers.set('x-api-key', apiSecret!);

    return fetch(url, {
        ...options,
        headers,
    });
}