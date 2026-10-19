// Generates a JSON Schema document for every schema in the endpoint registries,
// so a server backend written in a non-TS language
// can validate requests/responses against this contract without depending on
// zod. Run via `pnpm --filter @annotinder/contracts generate:json-schema`.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { annotatorEndpoints, clientEndpoints, dbEndpoints, researcherEndpoints } from "../src/endpoints/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "../dist/json-schema");

mkdirSync(outDir, { recursive: true });

// zod v4's native converter (zod-to-json-schema only understands zod v3 and
// silently emitted empty schemas). Things JSON Schema can't express (dates,
// custom refinements like codebook nesting rules) degrade to a permissive
// schema; servers that need them should port the corresponding check.
function toJsonSchema(schema: z.ZodType, io: "input" | "output") {
  if (schema instanceof z.ZodVoid) return null;
  return z.toJSONSchema(schema, { io, unrepresentable: "any" });
}

// One file per API (docs/api/README.md). A db server implements the first
// two; the job server the last two.
const registries = {
  "researcher-api": researcherEndpoints,
  "annotator-api": annotatorEndpoints,
  "client-api": clientEndpoints,
  "db-api": dbEndpoints,
};

for (const [file, registry] of Object.entries(registries)) {
  const combined: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(registry)) {
    combined[name] = {
      method: def.method,
      path: def.path,
      request: toJsonSchema(def.request, "input"),
      response: toJsonSchema(def.response, "output"),
    };
  }
  const outFile = join(outDir, `${file}.json`);
  writeFileSync(outFile, JSON.stringify(combined, null, 2));
  console.log(`Wrote JSON Schema for ${Object.keys(registry).length} endpoints to ${outFile}`);
}
