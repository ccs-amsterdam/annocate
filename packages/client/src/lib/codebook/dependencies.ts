const IDENTIFIER_RE = /^[A-Za-z_]\w*$/;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Statically (conservatively) extracts which of `knownNames` a script's
 * source text actually references, via a whole-word regex match per name
 * (design plan §12). Deliberately NOT a real JS parse/AST walk -- a
 * false-positive dependency (e.g. matching a name that only appears in a
 * comment or string literal) just causes an occasional unnecessary
 * recompute later, never a missed one, which is the safe direction to
 * over-approximate in for a caching/memoization use case.
 */
export function extractDependencies(script: string, knownNames: Iterable<string>): string[] {
  const found: string[] = [];
  for (const name of knownNames) {
    if (!IDENTIFIER_RE.test(name)) continue;
    if (new RegExp(`\\b${escapeRegExp(name)}\\b`).test(script)) found.push(name);
  }
  return found;
}
