/**
 * Balanced draws: the value the fewest sessions have, a tie broken at
 * random (so the first value isn't always the one that runs ahead when
 * sessions drop out). `random`: a number in [0, 1), as `Math.random`.
 */
export function leastUsed(values: readonly string[], count: (value: string) => number, random: () => number): string {
  if (values.length === 0) throw new Error("leastUsed needs at least one value");
  const counts = values.map(count);
  const fewest = Math.min(...counts);
  const tied = values.filter((_, i) => counts[i] === fewest);
  return tied[Math.min(tied.length - 1, Math.floor(random() * tied.length))]!;
}
