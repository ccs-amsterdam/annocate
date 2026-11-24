import { Plus, Trash2 } from "lucide-react";
import { parseHighlightQuery, type Highlight } from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "../ColorPicker";
import { DEFAULT_HIGHLIGHT_COLOR } from "../../../codebook/highlights";
import { Section } from "./Section";

/**
 * A layout's highlights (docs/client.md §3, "Highlights"): per row a query
 * (words; AND; "a phrase"; "near words"~5; climat*), a colour, and the unit
 * fields to search (default all the layout shows).
 */
export function HighlightsSection({
  highlights,
  unitFields,
  readOnly,
  onChange,
}: {
  highlights: Highlight[] | undefined;
  unitFields: string[];
  readOnly: boolean;
  onChange: (highlights: Highlight[] | undefined) => void;
}) {
  const list = highlights ?? [];
  const set = (next: Highlight[]) => onChange(next.length ? next : undefined);
  const update = (i: number, patch: Partial<Highlight>) =>
    set(
      list.map((h, j) => {
        if (j !== i) return h;
        const next = { ...h, ...patch };
        if (!next.color) delete next.color;
        if (!next.fields?.length) delete next.fields;
        return next;
      }),
    );
  return (
    <Section
      title="Highlights"
      topic="layout-templates#highlights"
      help='Words to mark in the unit: climate energy (either), AND, "a phrase", "near words"~5, climat*.'
    >
      {list.map((h, i) => {
        const parsed = parseHighlightQuery(h.query);
        return (
          <div key={i} className="flex flex-col gap-1.5 rounded-md border border-border p-2">
            <div className="flex items-center gap-1.5">
              <ColorPicker
                label={`Colour of highlight ${i + 1}`}
                value={h.color ?? DEFAULT_HIGHLIGHT_COLOR}
                onChange={(color) => update(i, { color })}
              />
              <Input
                aria-label={`Words to highlight (${i + 1})`}
                className="h-8 font-mono text-xs"
                placeholder='climate AND "energy policy"'
                value={h.query}
                readOnly={readOnly}
                aria-invalid={"error" in parsed}
                onChange={(e) => update(i, { query: e.target.value })}
              />
              {!readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove highlight ${i + 1}`}
                  onClick={() => set(list.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {"error" in parsed && h.query !== "" && <p className="text-[11px] text-destructive">{parsed.error}</p>}
            {unitFields.length > 1 && (
              <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                In:
                {unitFields.map((field) => {
                  const on = h.fields?.includes(field) ?? false;
                  return (
                    <button
                      key={field}
                      type="button"
                      disabled={readOnly}
                      aria-pressed={on}
                      onClick={() =>
                        update(i, {
                          fields: on ? h.fields!.filter((f) => f !== field) : [...(h.fields ?? []), field],
                        })
                      }
                      className={`rounded border px-1.5 py-0.5 font-mono ${
                        on ? "border-primary bg-primary/15 text-primary" : "border-border"
                      }`}
                    >
                      {field}
                    </button>
                  );
                })}
                {!h.fields?.length && <span>(all fields)</span>}
              </div>
            )}
          </div>
        );
      })}
      {!readOnly && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => set([...list, { query: "" }])}
        >
          <Plus className="h-3.5 w-3.5" /> Highlight
        </Button>
      )}
    </Section>
  );
}
