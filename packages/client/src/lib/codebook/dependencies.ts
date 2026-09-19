const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Statically (conservatively) extracts which of `knownNames` a script's
 * source text actually references, via a whole-word regex match per name
 * (design plan §12).
 */
export function extractDependencies(script: string, knownNames: Iterable<string>): string[] {
  const found: string[] = [];
  for (const name of knownNames) {
    if (!IDENTIFIER_RE.test(name)) continue;
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`).test(script)) found.push(name);
  }
  return found;
}
