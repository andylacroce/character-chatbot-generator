import { OptionDefaults } from "typedoc";

// Paths resolve relative to this file, hence the "../" prefixes.
/** @type {Partial<import("typedoc").TypeDocOptions>} */
const options = {
  entryPoints: ["../src"],
  entryPointStrategy: "expand",
  // Documents components, API routes, and shared server code; not route pages or the proxy.
  exclude: [
    "**/*.test.{ts,tsx}",
    "**/*.d.ts",
    "**/src/db/schema.ts",
    "**/src/app/!(components)/**",
    "**/src/app/*.{ts,tsx}",
    "**/src/pages/*.tsx",
    "**/src/proxy.ts",
  ],
  tsconfig: "../tsconfig.json",
  out: "../docs-generated",
  name: "Portrayal — code reference",
  readme: "none",
  excludePrivate: false,
  excludeExternals: true,
  excludeInternal: false,
  skipErrorChecking: true,
  // @swagger is this repo's OpenAPI annotation (see scripts/generate-openapi.cjs).
  blockTags: [...OptionDefaults.blockTags, "@swagger"],
  validation: { notExported: false, invalidLink: false, notDocumented: false },
  treatWarningsAsErrors: false,
};

export default options;
