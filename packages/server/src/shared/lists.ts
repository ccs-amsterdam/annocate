/** The first value that is in a list more than once; undefined if none is. */
export function firstDuplicate<T>(list: readonly T[]): T | undefined {
  const seen = new Set<T>();
  for (const value of list) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return undefined;
}
