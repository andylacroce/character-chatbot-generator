/**
 * Interactive API docs, served from the OpenAPI spec generated into
 * public/openapi.json by scripts/generate-openapi.cjs (see predev/build in
 * package.json). Not under pages/api, so it isn't subject to proxy.ts auth —
 * this is documentation, not a data-bearing route.
 */

import { ApiReference } from "@scalar/nextjs-api-reference";

const config = {
  url: "/openapi.json",
  metaData: {
    title: "Character Chatbot Generator API Reference",
  },
};

export const GET = ApiReference(config);
