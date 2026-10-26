import { extractReferences, referenceText, referenceValue, type ReferenceScope } from "@annotinder/contracts";

/**
 * What a script depends on (docs/client.md §6): the values at the references
 * it uses, read statically from its source (`extractReferences`). Names in a
 * script are always literal, so this is exact. Returns null if the script
 * has computed or bare references (`$var[x]`): then its dependencies can't
 * be known, and it must not be cached.
 */
export function extractDependencies(script: string, scope: ReferenceScope): Record<string, unknown> | null {
  const { references, errors } = extractReferences(script);
  if (errors.length > 0) return null;
  const deps: Record<string, unknown> = {};
  for (const ref of references) deps[referenceText(ref)] = referenceValue(scope, ref);
  return deps;
}
