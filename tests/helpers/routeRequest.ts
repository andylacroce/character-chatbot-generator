import { NextRequest } from "next/server";

/** Builds a `NextRequest` for calling an App Router handler directly (JSON body when given). */
export function routeRequest(
  method = "GET",
  { body, headers = {} }: { body?: unknown; headers?: Record<string, string> } = {},
): NextRequest {
  return new NextRequest("http://localhost/api/test", {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
