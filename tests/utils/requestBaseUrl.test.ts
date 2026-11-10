/** @jest-environment node */
import { getRequestBaseUrl } from "../../src/utils/server/requestBaseUrl";

const req = (headers: Record<string, string>) => new Request("http://internal/api/x", { headers });

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
    expect(getRequestBaseUrl(new Request("http://internal/api/x"))).toBe("https://");
  });
});
