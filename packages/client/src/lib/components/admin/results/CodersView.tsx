import type { QuestionAgreement, ResultCoder } from "@annotinder/contracts";
import { cn } from "cn";

/** A coder whose median time per unit is under this share of the coders' typical median is marked as fast. */
const FAST = 1 / 3;

/**
 * Per coder: their units, time per unit, practice tries, and agreement with
 * the others (docs/plans/results-viewer.md, "Coders"), lowest agreement
 * first: who to look at.
 */
export function CodersView({ coders, agreement }: { coders: ResultCoder[]; agreement: QuestionAgreement[] }) {
  if (coders.length === 0) return <p className="text-sm text-muted-foreground">No coder has answered a unit yet.</p>;
  // Kappa over all questions, weighing each question by the units the coder shares in it
  const kappa = new Map<number, { sum: number; weight: number }>();
  for (const question of agreement)
    for (const c of question.coders) {
      if (c.kappa === null) continue;
      const k = kappa.get(c.sessionId) ?? { sum: 0, weight: 0 };
      k.sum += c.kappa * c.units;
      k.weight += c.units;
      kappa.set(c.sessionId, k);
    }
  const kappaOf = (id: number) => {
    const k = kappa.get(id);
    return k && k.weight > 0 ? k.sum / k.weight : null;
  };
  const medians = coders
    .flatMap((c) => (c.medianUnitSeconds === null ? [] : [c.medianUnitSeconds]))
    .sort((a, b) => a - b);
  const typical = medians.length > 0 ? medians[Math.floor(medians.length / 2)] : null;
  const fast = (c: ResultCoder) =>
    typical !== null && c.medianUnitSeconds !== null && c.units >= 3 && c.medianUnitSeconds < typical * FAST;
  const rows = [...coders].sort((a, b) => (kappaOf(a.sessionId) ?? 2) - (kappaOf(b.sessionId) ?? 2));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Time per unit: the time its questions were on screen, added up; the median over the coder&apos;s units. Fast:
        under a third of the coders&apos; typical time. Agreement: Cohen&apos;s kappa with the other coders, over all
        questions.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 font-medium">
                Coder
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Units
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Seconds per unit
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Practice tries
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Kappa
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const k = kappaOf(c.sessionId);
              return (
                <tr key={c.sessionId} className="border-b border-border last:border-0">
                  <td className="px-3 py-1.5">{c.coder ?? `Session ${c.sessionId}`}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{c.units}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {c.medianUnitSeconds === null ? "–" : Math.round(c.medianUnitSeconds)}
                    {fast(c) && <span className="ml-1.5 text-xs font-medium text-destructive">fast</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {c.practiceTries === null ? "–" : c.practiceTries.toFixed(1)}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-1.5 text-right tabular-nums",
                      k !== null && k < 0.667 && "text-destructive",
                      k !== null && k >= 0.8 && "text-leaf-strong",
                    )}
                  >
                    {k === null ? "–" : k.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
