import { RE2JS } from "re2js";

// The pattern of a URL parameter (session.ts) comes from a design, the value
// it is matched against from anyone's link, before any login. JavaScript's
// own regular expressions backtrack: a pattern like `a*a*a*a*a*b` takes
// minutes on a value of 256 characters, and the server does nothing else
// meanwhile. So patterns are matched with RE2 (re2js), in time linear in
// the value whatever the pattern. RE2 has no backreferences (`\1`) and no
// lookahead (`(?=...)`): such patterns are refused.

/** Compiled patterns (null: not supported), the most recently used: a deployed design's few patterns are matched for every new session. */
const compiled = new Map<string, RE2JS | null>();
const MAX_COMPILED = 500;

function compile(pattern: string): RE2JS | null {
  const known = compiled.get(pattern);
  if (known !== undefined) return known;
  let re: RE2JS | null;
  try {
    re = RE2JS.compile(pattern);
  } catch {
    re = null;
  }
  if (compiled.size >= MAX_COMPILED) compiled.delete(compiled.keys().next().value!);
  compiled.set(pattern, re);
  return re;
}

/** Why a pattern can't be used, or null if it can. */
export function urlPatternError(pattern: string): string | null {
  return compile(pattern) ? null : "This pattern is not supported";
}

/** Whether a value matches a pattern in full (false for a pattern that isn't supported). */
export function matchesUrlPattern(value: string, pattern: string): boolean {
  return compile(pattern)?.matches(value) ?? false;
}
