import type { Context } from "hono";
import type { z } from "zod";
import { HttpError } from "./http.js";

/**
 * The largest id a request can name: ids are Postgres BIGINTs read as
 * numbers (an id beyond an INTEGER column's range is the database's 400).
 */
const MAX_ID = Number.MAX_SAFE_INTEGER;

/**
 * The request's JSON body, as `schema` reads it. 400 for a body that is not
 * JSON and for one the schema refuses (with the schema's `issues`).
 */
export async function parseJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.output<S>> {
  return parsed(schema, await jsonBody(c), "Invalid request body");
}

/** The request's query parameters, as `schema` reads them. 400 (with `issues`) if it refuses them. */
export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.output<S> {
  return parsed(schema, c.req.query(), "Invalid query parameters");
}

function parsed<S extends z.ZodType>(schema: S, value: unknown, refused: string): z.output<S> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
  throw new HttpError(400, refused, undefined, issues);
}

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

/** The id in path parameter `name`. 400 unless it is a positive integer in range. */
export function idParam(c: Context, name: string): number {
  const raw = c.req.param(name) ?? "";
  const id = /^[0-9]+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(id) || id <= 0 || id > MAX_ID) throw new HttpError(400, `Invalid ${idLabel(name)}`);
  return id;
}

/** `studyId` → "study id" */
const idLabel = (param: string) => (param === "id" ? "id" : param.replace(/Id$/, " id"));
