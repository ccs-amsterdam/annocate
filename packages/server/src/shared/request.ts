import type { Context } from "hono";
import type { z } from "zod";
import { HttpError } from "./http.js";

/** The largest id the database holds (ids are Postgres integers). */
const MAX_ID = 2 ** 31 - 1;

/**
 * What a body the schema refuses answers. The API has two shapes: the
 * researcher API sends the schema's issues (`{ error: { formErrors, fieldErrors } }`),
 * the coder and admin APIs only a message (`{ error: "Invalid request body" }`).
 */
export type BodyErrors = "issues" | "message";

/**
 * The request's JSON body, as `schema` reads it. 400 for a body that is not
 * JSON and for one the schema refuses.
 */
export async function parseJson<S extends z.ZodType>(
  c: Context,
  schema: S,
  errors: BodyErrors = "issues",
): Promise<z.output<S>> {
  const parsed = schema.safeParse(await jsonBody(c));
  if (parsed.success) return parsed.data;
  throw new HttpError(400, "Invalid request body", undefined, errors === "issues" ? parsed.error.flatten() : undefined);
}

async function jsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

/** The id in path parameter `name`. 400 unless it is a positive integer the database can hold. */
export function idParam(c: Context, name: string): number {
  const raw = c.req.param(name) ?? "";
  const id = /^[0-9]+$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(id) || id <= 0 || id > MAX_ID) throw new HttpError(400, `Invalid ${idLabel(name)}`);
  return id;
}

/** `studyId` → "study id" */
const idLabel = (param: string) => (param === "id" ? "id" : param.replace(/Id$/, " id"));
