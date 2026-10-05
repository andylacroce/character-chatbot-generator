import type { NextApiRequest } from "next";
import { getRequestBaseUrl } from "../../src/utils/requestBaseUrl";

const req = (headers: Record<string, unknown>) => ({ headers }) as unknown as NextApiRequest;

describe("getRequestBaseUrl", () => {
  it("prefers the forwarded protocol (first value) and host", () => {
    expect(
      getRequestBaseUrl(
        req({
          "x-forwarded-proto": "https,http",
          "x-forwarded-host": "app.example",
          host: "internal",
        }),
      ),
    ).toBe("https://app.example");
  });

  it("falls back to the Host header and https", () => {
    expect(getRequestBaseUrl(req({ host: "localhost:3000" }))).toBe("https://localhost:3000");
  });

  it("yields an empty host when none is present", () => {
    expect(getRequestBaseUrl(req({}))).toBe("https://");
  });
});
