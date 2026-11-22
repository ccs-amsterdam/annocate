import { LayoutDesigner, UnitPreview } from "../LayoutDesigner";
import { Intro, type StepProps } from "./common";

/** Which unit fields coders see where (title, byline, body), with the first unit as a preview. */
export function LayoutStep({ answers, set }: StepProps) {
  const fields = (answers.units?.fields ?? []).map((f) => f.name);
  const types = Object.fromEntries((answers.units?.fields ?? []).map((f) => [f.name, f.type]));
  const first = answers.units?.units[0];
  return (
    <>
      <Intro>
        Choose what coders see of each unit: click a place (title, byline, body) to put a field there, or drag a field
        onto it. The editor&apos;s Layout tab can change this later.
      </Intro>
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Layout</h3>
          {fields.length > 0 ? (
            <LayoutDesigner
              layout={answers.layout}
              fields={fields}
              types={types}
              onChange={(layout) => set({ layout })}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Upload units first (or choose their fields in the editor later).
            </p>
          )}
        </section>
        <section className="space-y-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            The first unit, as coders see it
          </h3>
          <div className="rounded-lg border border-border bg-background p-4">
            {first ? (
              <UnitPreview layout={answers.layout} unit={{ id: first.externalId, ...first.data }} />
            ) : (
              <p className="text-sm text-muted-foreground">No units yet.</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
