import { useState } from "react";
import type { ResultUnit, ResultsUnit, UnitData } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useResultUnitQuery } from "../../../admin/queries";
import { useRenderedLayout } from "../renderedLayout";
import { UnitFields } from "../../UnitFields";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import type { DesignLabels } from "./designLabels";
import { questionAnswerRows } from "./unitAnswers";

const PAGE = 50;

/**
 * Units two or more coders answered, most disagreement first (docs/plans/
 * results-viewer.md, "Units"); one opens as coders saw it, with every
 * coder's answers.
 */
export function UnitsView({
  client,
  units,
  labels,
}: {
  client: ResearcherApi;
  units: ResultUnit[];
  labels: DesignLabels;
}) {
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<ResultUnit | null>(null);
  if (units.length === 0)
    return <p className="text-sm text-muted-foreground">No unit has been answered by two or more coders yet.</p>;
  if (open) return <UnitDetail client={client} unit={open} labels={labels} onBack={() => setOpen(null)} />;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Units two or more coders answered. Disagreement: per question the share of pairs of coders who answered
        differently, averaged over the loop&apos;s questions.
      </p>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 font-medium">
                Unit
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Loop
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Coders
              </th>
              <th scope="col" className="w-1/3 px-3 py-2 font-medium">
                Disagreement
              </th>
            </tr>
          </thead>
          <tbody>
            {units.slice(0, shown).map((u) => (
              <tr key={`${u.loop}/${u.unitId}`} className="border-b border-border last:border-0">
                <td className="px-3 py-1.5">
                  <button
                    type="button"
                    onClick={() => setOpen(u)}
                    className="cursor-pointer font-mono text-primary underline-offset-2 hover:underline"
                  >
                    {u.externalId}
                  </button>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{labels.loopTitle(u.loop)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{u.coders}</td>
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <span className="h-2 flex-1 rounded-sm bg-muted" aria-hidden="true">
                      <span
                        className="block h-full rounded-sm bg-destructive/60"
                        style={{ width: `${u.disagreement * 100}%` }}
                      />
                    </span>
                    <span className="w-10 text-right text-xs tabular-nums">{Math.round(u.disagreement * 100)}%</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {units.length > shown && (
        <Button variant="outline" size="sm" className="self-start" onClick={() => setShown(shown + PAGE)}>
          Show more ({units.length - shown} left)
        </Button>
      )}
    </div>
  );
}

function UnitDetail({
  client,
  unit,
  labels,
  onBack,
}: {
  client: ResearcherApi;
  unit: ResultUnit;
  labels: DesignLabels;
  onBack: () => void;
}) {
  const query = useResultUnitQuery(client, unit.unitId);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack}>
          Back to the units
        </Button>
        <span className="font-mono text-sm font-medium">{unit.externalId}</span>
        <span className="text-sm text-muted-foreground">{labels.loopTitle(unit.loop)}</span>
      </div>
      <UnitDetailBody query={query} loop={labels.loop(unit.loop)} labels={labels} />
    </div>
  );
}

type LoopLabels = NonNullable<ReturnType<DesignLabels["loop"]>>;

/** The open unit: as its coders saw it, then every coder's answers per question. */
function UnitDetailBody({
  query,
  loop,
  labels,
}: {
  query: { data: ResultsUnit | undefined; error: Error | null };
  /** The unit's loop in the deployed design; undefined: no longer in it (or the design is still loading). */
  loop: LoopLabels | undefined;
  labels: DesignLabels;
}) {
  if (query.error) return <p className="text-sm text-destructive">{query.error.message}</p>;
  const detail = query.data;
  if (!detail || !labels.ready) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!loop)
    return (
      <p className="text-sm text-muted-foreground">
        This unit was coded in a unit loop that is no longer in the deployed design, so it can&apos;t be shown here. Its
        answers are in the download.
      </p>
    );
  return (
    <>
      <UnitAsSeen layout={loop.layout} detail={detail} labels={labels} />
      {loop.questions.map((question) => (
        <QuestionAnswers key={question} question={question} detail={detail} labels={labels} />
      ))}
    </>
  );
}

/** The unit through the loop's layout, as most of its coders saw it. */
function UnitAsSeen({
  layout,
  detail,
  labels,
}: {
  layout: LoopLabels["layout"];
  detail: ResultsUnit;
  labels: DesignLabels;
}) {
  const seen = new Map<number, number>();
  for (const a of detail.answers)
    if (a.unitVersionId !== null) seen.set(a.unitVersionId, (seen.get(a.unitVersionId) ?? 0) + 1);
  const versionId = [...seen].sort((a, b) => b[1] - a[1])[0]?.[0];
  const data = (detail.versions.find((v) => v.id === versionId)?.data ?? {}) as UnitData;
  const rendered = useRenderedLayout(layout, data, labels.questions, undefined, undefined, []);
  return (
    <div className="flex flex-col gap-1">
      {detail.versions.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Its coders saw {detail.versions.length} versions of this unit; this is the one most of them saw.
        </p>
      )}
      <div className="max-h-96 overflow-auto rounded-lg border border-border bg-card p-4">
        <UnitFields layout={layout} rendered={rendered} />
      </div>
    </div>
  );
}

/** One question: each coder's answer, marked when they don't all agree. */
function QuestionAnswers({
  question,
  detail,
  labels,
}: {
  question: string;
  detail: ResultsUnit;
  labels: DesignLabels;
}) {
  const type = labels.questions.get(question);
  const items = type?.type === "scale" ? type.items.map((i) => i.name) : [undefined];
  const { rows, differ } = questionAnswerRows(detail, question, items, (v) => labels.valueLabel(question, v));
  if (rows.length === 0) return null;
  return (
    <section
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border bg-card p-3",
        differ ? "border-destructive/50" : "border-border",
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-sm font-medium">{question}</span>
        <span className="truncate text-sm text-muted-foreground">{labels.questionText(question)}</span>
        {differ && <span className="ml-auto shrink-0 text-xs text-destructive">Coders differ</span>}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.sessionId} className="align-top">
              <td className="w-40 py-0.5 pr-3 text-muted-foreground">{row.coder ?? `Session ${row.sessionId}`}</td>
              <td className="py-0.5">
                {items.map((item, i) => (
                  <div key={item ?? ""}>
                    {item && <span className="text-muted-foreground">{labels.itemLabel(question, item)}: </span>}
                    {row.texts[i]}
                  </div>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
