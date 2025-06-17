/**
 * Attempts to fetch a summary for a person or character from Wikipedia.
 * Returns a short description or null if not found.
 */
export async function getPersonDescription(name: string): Promise<string | null> {
    const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`;
    try {
        const res = await fetch(apiUrl);
        if (!res.ok) return null;
        const data = await res.json();
        if (data && typeof data === "object" && typeof (data as any).extract === "string") {
            const extract = (data as any).extract as string;
            // Use the first sentence or two for brevity
            return extract.split('. ').slice(0, 2).join('. ') + '.';
        }
        return null;
    } catch (e) {
        return null;
    }
}
