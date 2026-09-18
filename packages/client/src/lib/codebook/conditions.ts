/**
 * Evaluates a codebook `condition` item's expression (design plan §2) against
 * a map of currently-known variable values (name -> the value the coder
 * picked, e.g. a code string). Item names are validated (see
 * `@annotinder/contracts` SafeNameSchema) to be alphanumeric/underscore, so
 * they're safe to use directly as function parameter names here.
 *
 * NOTE: this is intentionally simple (a `new Function` eval, not a real
 * sandboxed interpreter as the old codebase had a `SandboxContext` for) --
 * codebook expressions come from the job's own admins, the same trust level
 * as the rest of the codebook document, so this is not treated as untrusted
 * user input. Revisit if that trust assumption changes (see design plan §6
 * notes on hardening).
 */
export function evaluateCondition(expression: string, values: Record<string, unknown>): boolean {
  const names = Object.keys(values).filter((name) => /^[A-Za-z_]\w*$/.test(name));
  try {
    const fn = new Function(...names, `"use strict"; return Boolean(${expression});`);
    return Boolean(fn(...names.map((name) => values[name])));
  } catch (err) {
    console.error(`Failed to evaluate condition '${expression}':`, err);
    return false;
  }
}
