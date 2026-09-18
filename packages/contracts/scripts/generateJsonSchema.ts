// Generates a JSON Schema document for every schema in the endpoint registry
// (design plan Phase 1.4), so a server backend written in a non-TS language
// can validate requests/responses against this contract without depending on
// zod. Run via `pnpm --filter @annotinder/contracts generate:json-schema`.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { endpoints } from "../src/endpoints/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../dist/json-schema");

mkdirSync(outDir, { recursive: true });

const combined: Record<string, unknown> = {};

for (const [name, def] of Object.entries(endpoints)) {
  combined[name] = {
    method: def.method,
    path: def.path,
    request: zodToJsonSchema(def.request, `${name}Request`),
    response: zodToJsonSchema(def.response, `${name}Response`),
  };
}

const outFile = join(outDir, "endpoints.json");
writeFileSync(outFile, JSON.stringify(combined, null, 2));
console.log(`Wrote JSON Schema for ${Object.keys(endpoints).length} endpoints to ${outFile}`);
