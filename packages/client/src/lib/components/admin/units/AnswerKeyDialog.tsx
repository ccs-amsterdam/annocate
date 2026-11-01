import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  buildScope,
  formatAnswerKey,
  parseAnswerKey,
  unitScopeData,
  type AnswerAlternative,
  type AnyVariableType,
  type UnitDataValue,
  type UnitField,
  type UnitLayout,
  type UnitResponse,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { renderTemplate, type RenderedTemplate } from "../../../codebook/renderTemplate";
import { UnitFields } from "../../UnitFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// "Create gold values" (docs/plans/special-sets.md §4): goes through a
// group's gold or practice units with the loop's layout, and writes the right
// answers (and practice messages) into their answer columns (contracts
// answerKey.ts for the cells).

export interface AnswerKeyQuestion {
  name: string;
  variable: AnyVariableType;
}

type Cells = Record<string, string>;

const cellText = (value: unknown) => (value === null || value === undefined ? "" : String(value));

/** A cell as the column's type: numbers and booleans where the field has that type. */
function cellValue(text: string, field: UnitField | undefined): UnitDataValue | { error: string } {
  const t = text.trim();
  if (t === "") return null;
  if (field?.type === "number") {
    const n = Number(t);
    return Number.isFinite(n) ? n : { error: `Column ${field.name} holds numbers: "${t}" can't go in it.` };
  }
  if (field?.type === "boolean") return t === "true";
  return t;
}

/** The option values of a choice question; undefined for numbers and confirm. */
function optionsOf(variable: AnyVariableType): { value: string; label: string }[] | undefined {
  if (!("options" in variable) || !Array.isArray(variable.options)) return undefined;
  return (variable.options as { value: unknown; label?: string }[]).map((o) => ({ value: String(o.value), label: o.label ?? String(o.value) }));
}

/** One question's right answer: option chips, a range or a checkbox, plus the cell as text. */
function AnswerInput({ question, cell, onChange }: { question: AnswerKeyQuestion; cell: string; onChange: (cell: string) => void }) {
  const key = parseAnswerKey(cell) ?? [];
  const options = optionsOf(question.variable);
  const multiple = question.variable.type === "nominal" && question.variable.multiple === true;
  let control = null;
  if (options) {
    // One answer: each chosen option is an alternative (any is right). Several answers: together, one alternative.
    const chosen = new Set(key.flatMap((alt) => ("values" in alt ? alt.values : [])));
    const toggle = (value: string) => {
      const next = options.map((o) => o.value).filter((v) => (v === value ? !chosen.has(v) : chosen.has(v)));
      const alternatives: AnswerAlternative[] = next.length === 0 ? [] : multiple ? [{ values: next }] : next.map((v) => ({ values: [v] }));
      onChange(formatAnswerKey(alternatives));
    };
    control = (
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <Button key={o.value} type="button" size="sm" variant={chosen.has(o.value) ? "default" : "outline"} aria-pressed={chosen.has(o.value)} onClick={() => toggle(o.value)}>
            {o.label}
          </Button>
        ))}
      </div>
    );
  } else if (question.variable.type === "numeric") {
    const alt = key[0];
    const [from, to] = !alt ? ["", ""] : "range" in alt ? [String(alt.range[0]), String(alt.range[1])] : [alt.values[0] ?? "", ""];
    const set = (f: string, t: string) => onChange(f === "" ? "" : t === "" ? f : `${f}..${t}`);
    control = (
      <div className="flex items-center gap-2 text-xs">
        <Input type="number" aria-label={`${question.name}: right answer`} className="h-8 w-24" value={from} onChange={(e) => set(e.target.value, to)} />
        to
        <Input type="number" aria-label={`${question.name}: up to`} className="h-8 w-24" placeholder="(exactly)" value={to} onChange={(e) => set(from, e.target.value)} />
      </div>
    );
  } else if (question.variable.type === "confirm") {
    control = (
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={cell.trim() === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "")} /> Confirmed is right
      </label>
    );
  }
  return (
    <div className="flex flex-col gap-1.5">
      {control}
      <Input aria-label={`${question.name}: cell`} className="h-7 font-mono text-xs" value={cell} placeholder="empty: not checked" onChange={(e) => onChange(e.target.value)} />
      {options && !multiple && key.length > 1 && <span className="text-[11px] text-muted-foreground">Any of these is right.</span>}
    </div>
  );
}

export function AnswerKeyDialog({
  client,
  group,
  set,
  what,
  questions,
  column,
  messageColumn,
  layout,
  onClose,
}: {
  client: ResearcherApi;
  group: string;
  set: string;
  /** "gold" or "practice": in texts. */
  what: string;
  questions: AnswerKeyQuestion[];
  column: (question: string) => string;
  /** Practice: the column of a unit's own feedback per question. */
  messageColumn?: (question: string) => string;
  layout: UnitLayout;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [units, setUnits] = useState<UnitResponse[] | null>(null);
  const [fields, setFields] = useState<UnitField[]>([]);
  const [edits, setEdits] = useState<Record<number, Cells>>({});
  const [index, setIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [rendered, setRendered] = useState<RenderedTemplate | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all: UnitResponse[] = [];
      for (;;) {
        const page = await client.listUnitPage({ offset: all.length, limit: 200, group, set });
        all.push(...page.units);
        if (page.units.length === 0 || all.length >= page.total) break;
      }
      const known = await client.getUnitFields();
      if (!cancelled) {
        setUnits(all);
        setFields(known);
      }
    })().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, [client, group, set]);

  const unit = units?.[index];
  const questionMap = useMemo(() => new Map(questions.map((q) => [q.name, q.variable])), [questions]);
  useEffect(() => {
    if (!unit) return;
    let cancelled = false;
    renderTemplate(layout.template, buildScope(questionMap, {}, unitScopeData(unit)), undefined, "answer-key", { snippets: layout.snippets }).then(
      (r) => !cancelled && setRendered(r),
      () => !cancelled && setRendered(null),
    );
    return () => {
      cancelled = true;
    };
  }, [unit, layout, questionMap]);

  const cell = (u: UnitResponse, col: string) => edits[u.id]?.[col] ?? cellText(u.data[col]);
  const setCell = (u: UnitResponse, col: string, value: string) => setEdits((e) => ({ ...e, [u.id]: { ...e[u.id], [col]: value } }));
  const done = (u: UnitResponse) => questions.every((q) => parseAnswerKey(cell(u, column(q.name))) !== null);
  const changed = units?.filter((u) => Object.entries(edits[u.id] ?? {}).some(([col, v]) => v !== cellText(u.data[col]))) ?? [];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const byName = new Map(fields.map((f) => [f.name, f]));
      const body = changed.map((u) => {
        const data = { ...u.data };
        for (const [col, text] of Object.entries(edits[u.id] ?? {})) {
          const value = cellValue(text, byName.get(col));
          if (value !== null && typeof value === "object") throw new Error(value.error);
          data[col] = value;
        }
        return { externalId: u.externalId, data };
      });
      // Answer columns are never shown to coders, so writing them makes no new unit versions.
      for (let i = 0; i < body.length; i += 200) await client.createUnits({ units: body.slice(i, i + 200), overwriteCoded: true });
      await queryClient.invalidateQueries();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const ready = units?.filter(done).length ?? 0;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>Right answers of the {what} units</DialogTitle>
          <DialogDescription>
            Group {group}, set {set}: {units ? `${ready} of ${units.length} have answers for every checked question` : "loading…"}. Coders never see these columns.
          </DialogDescription>
        </DialogHeader>
        {units && units.length === 0 && <p className="text-sm">Group {group} has no {set} units yet: add them (a set named {set}) on the Units page.</p>}
        {unit && (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <div className="flex items-center gap-2 text-sm">
              <Button variant="outline" size="icon-sm" aria-label="Previous unit" disabled={index === 0} onClick={() => setIndex(index - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                Unit {index + 1} of {units!.length}: <span className="font-mono">{unit.externalId}</span>
              </span>
              <Button variant="outline" size="icon-sm" aria-label="Next unit" disabled={index === units!.length - 1} onClick={() => setIndex(index + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <span className={done(unit) ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>{done(unit) ? "answered" : "missing answers"}</span>
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border border-border p-3">
              {rendered ? <UnitFields layout={layout} rendered={rendered} /> : <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(unit.data, null, 2)}</pre>}
            </div>
            {questions.map((q) => (
              <div key={q.name} className="flex flex-col gap-1.5 rounded-md border border-border p-3">
                <span className="text-xs font-semibold">
                  {"question" in q.variable && q.variable.question ? q.variable.question : q.name}{" "}
                  <span className="font-normal text-muted-foreground">({column(q.name)})</span>
                </span>
                <AnswerInput question={q} cell={cell(unit, column(q.name))} onChange={(v) => setCell(unit, column(q.name), v)} />
                {messageColumn && (
                  <Textarea
                    aria-label={`${q.name}: message when wrong`}
                    className="text-xs"
                    placeholder="Message when wrong (optional; default: the loop's message, or the expected answer)"
                    value={cell(unit, messageColumn(q.name))}
                    onChange={(e) => setCell(unit, messageColumn(q.name), e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving || changed.length === 0} onClick={() => void save()}>
            Save {changed.length > 0 ? `${changed.length} unit${changed.length === 1 ? "" : "s"}` : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
