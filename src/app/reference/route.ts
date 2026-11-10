/**
 * Interactive API docs, served from the OpenAPI spec generated into
 * public/openapi.json by scripts/generate-openapi.cjs (see predev/build in
 * package.json). Not under app/api, so it isn't subject to proxy.ts auth —
 * this is documentation, not a data-bearing route.
 */

import { ApiReference } from "@scalar/nextjs-api-reference";

const config = {
  url: "/openapi.json",
  metaData: {
    title: "Portrayal API Reference",
  },
};

export const GET = ApiReference(config);
