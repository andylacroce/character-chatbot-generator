/**
 * Generates public/openapi.json from @swagger JSDoc comments in pages/api/*.ts.
 *
 * Runs at dev/build time (see predev/build in package.json) rather than reading
 * route source at request time: Vercel's serverless bundler doesn't reliably ship
 * raw .ts source alongside compiled output, so a runtime scanner (e.g.
 * next-swagger-doc) can silently return an empty spec in production. Writing a
 * static JSON file into /public sidesteps that — public/ is always served as-is.
 */

const fs = require("fs");
const path = require("path");
const swaggerJsdoc = require("swagger-jsdoc");

const pkg = require("../package.json");

const spec = swaggerJsdoc({
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Character Chatbot Generator API",
      version: pkg.version,
      description:
        "Server-side API for the Character Chatbot Generator. All routes are " +
        "gated by proxy.ts: same-origin browser requests are allowed automatically, " +
        "external callers must send an `x-api-key` header matching API_SECRET.",
    },
    servers: [{ url: "/api" }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description:
            "Required for requests from origins other than localhost or the " +
            "app's own Vercel deployment. See proxy.ts.",
        },
      },
    },
    security: [{ ApiKeyAuth: [] }],
  },
  // swagger-jsdoc's glob resolution doesn't match backslash-separated paths, so
  // force forward slashes regardless of platform.
  apis: [path.join(__dirname, "..", "pages", "api", "*.ts").split(path.sep).join("/")],
});

const outPath = path.join(__dirname, "..", "public", "openapi.json");
fs.writeFileSync(outPath, JSON.stringify(spec, null, 2) + "\n", "utf8");

const pathCount = Object.keys(spec.paths || {}).length;
console.log(`Generated ${outPath} (${pathCount} documented paths)`);
