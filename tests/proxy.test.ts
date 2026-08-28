/**
 * Tests for the API auth proxy (`proxy.ts`).
 *
 * This is the single choke point guarding every `/api/*` route, so the cases below
 * pin down both directions: first-party callers must get through without an API key,
 * and everyone else must present one. The look-alike-host and missing-Origin cases
 * cover bypasses that host prefix/substring matching used to allow.
 */

jest.mock("next/server", () => {
    class MockNextResponse {
        body: unknown;
        status: number;
        passthrough: boolean;

        constructor(body: unknown = null, init: { status?: number } = {}) {
            this.body = body;
            this.status = init.status ?? 200;
            this.passthrough = false;
        }

        static next() {
            const res = new MockNextResponse(null, { status: 200 });
            res.passthrough = true;
            return res;
        }
    }
    return { NextResponse: MockNextResponse };
});

jest.mock("../src/utils/logger", () => ({
    logEvent: jest.fn(),
    sanitizeLogMeta: jest.fn((meta: Record<string, unknown>) => meta),
}));

import { proxy, config } from "../proxy";
import { logEvent } from "../src/utils/logger";

const API_SECRET = "test-secret";
const PROD_HOST = "character-chatbot-generator.vercel.app";
const PROD_ORIGIN = `https://${PROD_HOST}`;

/** Builds the minimal shape of NextRequest that the proxy actually reads. */
function makeRequest({
    headers = {},
    method = "GET",
    url = `${PROD_ORIGIN}/api/chat`,
}: {
    headers?: Record<string, string>;
    method?: string;
    url?: string;
} = {}) {
    const lowered = new Map(
        Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
    );
    return {
        method,
        url,
        headers: { get: (name: string) => lowered.get(name.toLowerCase()) ?? null },
    // The proxy only touches `method`, `url` and `headers.get`, so a structural
    // stand-in avoids needing a full Request/Response polyfill under jsdom.
    } as unknown as Parameters<typeof proxy>[0];
}

/** True when the proxy let the request continue to the API route. */
function allowed(res: ReturnType<typeof proxy>): boolean {
    return (res as unknown as { passthrough: boolean }).passthrough === true;
}

describe("proxy", () => {
    const originalSecret = process.env.API_SECRET;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.API_SECRET = API_SECRET;
    });

    afterAll(() => {
        if (originalSecret === undefined) delete process.env.API_SECRET;
        else process.env.API_SECRET = originalSecret;
    });

    it("only runs for API routes", () => {
        expect(config.matcher).toEqual(["/api/:path*"]);
    });

    describe("Auth.js routes", () => {
        it.each([
            "/api/auth/signin",
            "/api/auth/signin/google",
            "/api/auth/callback/google",
            "/api/auth/session",
            "/api/auth/csrf",
        ])("bypasses the origin/API-key check for %s", (path) => {
            // The OAuth callback in particular arrives as a top-level navigation from
            // accounts.google.com — a real, non-first-party Referer with no API key,
            // which is exactly what the rest of this proxy would otherwise reject.
            const res = proxy(
                makeRequest({
                    method: "GET",
                    url: `${PROD_ORIGIN}${path}`,
                    headers: { referer: "https://accounts.google.com/" },
                }),
            );

            expect(allowed(res)).toBe(true);
        });

        it("does not bypass a look-alike path outside /api/auth/", () => {
            const res = proxy(
                makeRequest({
                    method: "POST",
                    url: `${PROD_ORIGIN}/api/authorize-payment`,
                    headers: { referer: "https://accounts.google.com/" },
                }),
            );

            expect(res.status).toBe(401);
        });
    });

    it("fails closed with 500 when API_SECRET is not configured", () => {
        delete process.env.API_SECRET;
        const res = proxy(makeRequest({ headers: { origin: PROD_ORIGIN } }));

        expect(res.status).toBe(500);
        expect(logEvent).toHaveBeenCalledWith(
            "error",
            "api_secret_missing",
            expect.any(String),
            {},
        );
    });

    describe("allowed origins", () => {
        it.each([
            ["production", PROD_ORIGIN],
            ["localhost with a port", "http://localhost:3000"],
            ["localhost without a port", "http://localhost"],
            ["127.0.0.1 with a port", "http://127.0.0.1:8080"],
            ["a git preview deployment", "https://character-chatbot-generator-git-my-branch-andylacroces-projects.vercel.app"],
            ["a hashed preview deployment", "https://character-chatbot-generator-abc123-andylacroces-projects.vercel.app"],
        ])("allows %s without an API key", (_label, origin) => {
            const res = proxy(
                makeRequest({ method: "POST", headers: { origin, host: PROD_HOST } }),
            );

            expect(allowed(res)).toBe(true);
        });

        it("allows a first-party Referer when Origin is absent", () => {
            const res = proxy(
                makeRequest({
                    method: "POST",
                    headers: { referer: `${PROD_ORIGIN}/some/page?q=1`, host: PROD_HOST },
                }),
            );

            expect(allowed(res)).toBe(true);
        });

        it("allows a trailing slash on the origin", () => {
            const res = proxy(
                makeRequest({ method: "POST", headers: { origin: `${PROD_ORIGIN}/`, host: PROD_HOST } }),
            );

            expect(allowed(res)).toBe(true);
        });
    });

    describe("look-alike origins", () => {
        it.each([
            // Prefix match on the allowed origin string used to let this through.
            ["a suffixed look-alike domain", `${PROD_ORIGIN}.attacker.com`],
            ["a look-alike subdomain host", "https://character-chatbot-generator.vercel.app.evil.io"],
            ["an unrelated vercel.app host", "https://someone-elses-app.vercel.app"],
            ["a preview host under another scope", "https://character-chatbot-generator-git-main-attacker-projects.vercel.app"],
            ["plain http in production", `http://${PROD_HOST}`],
            ["an allowed host smuggled into a path", "https://evil.com/https://character-chatbot-generator.vercel.app"],
            ["an allowed host smuggled into userinfo", "https://character-chatbot-generator.vercel.app@evil.com"],
            ["an opaque null origin", "null"],
            ["a non-URL origin", "not a url"],
        ])("rejects %s without an API key", (_label, origin) => {
            const res = proxy(
                makeRequest({ method: "POST", headers: { origin, host: PROD_HOST } }),
            );

            expect(res.status).toBe(401);
        });
    });

    describe("requests with no Origin or Referer", () => {
        it("allows a safe method on a first-party host", () => {
            const res = proxy(
                makeRequest({ method: "GET", headers: { host: PROD_HOST } }),
            );

            expect(allowed(res)).toBe(true);
        });

        it("allows a safe method on localhost", () => {
            const res = proxy(
                makeRequest({ method: "HEAD", headers: { host: "localhost:3000" } }),
            );

            expect(allowed(res)).toBe(true);
        });

        it("rejects a POST on a first-party host without an API key", () => {
            // Browsers always send Origin on POST, so this is a non-browser client
            // reaching for the endpoints that spend money on model calls.
            const res = proxy(
                makeRequest({ method: "POST", headers: { host: PROD_HOST } }),
            );

            expect(res.status).toBe(401);
            expect(logEvent).toHaveBeenCalledWith(
                "warn",
                "api_key_invalid",
                expect.any(String),
                expect.objectContaining({ apiKey: "[MISSING]", method: "POST" }),
            );
        });

        it("rejects a safe method on a look-alike host", () => {
            const res = proxy(
                makeRequest({ method: "GET", headers: { host: `${PROD_HOST}.attacker.com` } }),
            );

            expect(res.status).toBe(401);
        });

        it("rejects a safe method when the host header is missing", () => {
            const res = proxy(makeRequest({ method: "GET" }));

            expect(res.status).toBe(401);
        });

        it("allows a POST that presents the API key", () => {
            const res = proxy(
                makeRequest({
                    method: "POST",
                    headers: { host: PROD_HOST, "x-api-key": API_SECRET },
                }),
            );

            expect(allowed(res)).toBe(true);
        });
    });

    describe("external callers with an API key", () => {
        it("allows a correct key", () => {
            const res = proxy(
                makeRequest({
                    method: "POST",
                    headers: { origin: "https://partner.example.com", "x-api-key": API_SECRET },
                }),
            );

            expect(allowed(res)).toBe(true);
        });

        it("rejects an incorrect key and logs its presence, not its value", () => {
            const res = proxy(
                makeRequest({
                    method: "POST",
                    headers: { origin: "https://partner.example.com", "x-api-key": "wrong" },
                }),
            );

            expect(res.status).toBe(401);
            expect(logEvent).toHaveBeenCalledWith(
                "warn",
                "api_key_invalid",
                expect.any(String),
                expect.objectContaining({ apiKey: "[PRESENT]" }),
            );
            const meta = (logEvent as jest.Mock).mock.calls[0][3];
            expect(JSON.stringify(meta)).not.toContain("wrong");
        });
    });
});
