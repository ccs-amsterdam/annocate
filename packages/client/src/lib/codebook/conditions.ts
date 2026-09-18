import { evaluate } from "@marcbachmann/cel-js";

/**
 * Evaluates a codebook `condition` item's expression (design plan §2) against
 * a map of currently-known variable values (name -> the value the coder
 * picked, e.g. a code string).
 *
 * Uses Google's Common Expression Language (CEL) via `@marcbachmann/cel-js`
 * rather than a JS `new Function`/eval. This replaces an earlier
 * unsandboxed-`new Function` version of this file after a hardening review
 * (see `hardening_eval.txt` at the repo root) identified real risk in
 * treating codebook expressions as fully trusted: a job admin authoring a
 * malicious expression could still affect *other* people's sessions (e.g. a
 * coder who is also an admin/owner elsewhere), and a future server-side
 * evaluator (for validation) would otherwise need JS eval + sandboxing on
 * every server runtime (Node/Python/R). CEL is non-Turing-complete, has no
 * ambient authority/side effects, and has evaluator implementations across
 * languages, which sidesteps both concerns entirely instead of sandboxing.
 */
export function evaluateCondition(expression: string, values: Record<string, unknown>): boolean {
  try {
    return Boolean(evaluate(expression, values));
  } catch (err) {
    console.error(`Failed to evaluate condition '${expression}':`, err);
    return false;
  }
}
