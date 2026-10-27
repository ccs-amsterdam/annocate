import { useEffect, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import { cn } from "cn";
import { renderTemplate, type RenderedTemplate } from "../codebook/renderTemplate";
import { UnitFields } from "../components/UnitFields";
import { exampleScope, parseExample, type HelpExampleData } from "./example";
import { highlightTemplate } from "./highlight";

const editorText = "m-0 whitespace-pre-wrap break-words p-3 font-mono text-xs leading-5";

/**
 * A live template example in a help topic (`example.ts`): the template,
 * editable, and the unit as a coder sees it, with the example's unit data
 * and, where it has them, switches for the answers and the question on
 * screen.
 */
export function HelpExample({ source }: { source: string }) {
  const parsed = useMemo((): { data: HelpExampleData } | { error: string } => {
    try {
      return { data: parseExample(source) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [source]);
  if ("error" in parsed) return <pre className="text-destructive">{parsed.error}</pre>;
  return <LiveExample data={parsed.data} />;
}

function LiveExample({ data }: { data: HelpExampleData }) {
  const [template, setTemplate] = useState(data.template);
  const [chosen, setChosen] = useState(() => Object.fromEntries(Object.entries(data.answers).map(([q, alts]) => [q, alts[0]])));
  const [step, setStep] = useState(data.steps[0] ?? null);
  const [result, setResult] = useState<{ rendered: RenderedTemplate } | { error: string } | null>(null);

  useEffect(() => {
    let current = true;
    const scope = exampleScope(data, chosen);
    renderTemplate(template, scope, undefined, "help", {
      snippets: data.snippets,
      ...(data.steps.length ? { progress: { current: step, order: data.steps } } : {}),
    })
      .then((rendered) => current && setResult({ rendered }))
      .catch((e: unknown) => current && setResult({ error: e instanceof Error ? e.message : String(e) }));
    return () => {
      current = false;
    };
  }, [data, template, chosen, step]);

  const switches = Object.entries(data.answers).filter(([, alts]) => alts.length > 1);
  const unitFields = Object.entries(data.unit);

  return (
    <div className="not-prose my-6 overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Template · try editing it</span>
        {template !== data.template && (
          <button
            type="button"
            onClick={() => setTemplate(data.template)}
            className="flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>
      <div className="relative bg-muted/20">
        <pre aria-hidden className={cn(editorText, "min-h-11")}>
          {highlightTemplate(template)}
          {/* Keeps a trailing newline's line */}
          {"\n"}
        </pre>
        <textarea
          aria-label="Example template"
          spellCheck={false}
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className={cn(editorText, "absolute inset-0 h-full w-full resize-none overflow-hidden bg-transparent text-transparent caret-foreground outline-none")}
        />
      </div>

      {(unitFields.length > 0 || data.snippets || switches.length > 0 || data.steps.length > 0) && (
        <div className="flex flex-col gap-2 border-t border-border px-3 py-2 text-xs">
          {unitFields.length > 0 && (
            <details>
              <summary className="cursor-pointer text-muted-foreground">Unit data</summary>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-[11px]">
                {unitFields.map(([field, value]) => (
                  <div key={field} className="contents">
                    <dt className="text-sky-700 dark:text-sky-300">$unit.{field}</dt>
                    <dd className="whitespace-pre-wrap break-words">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {data.snippets && (
            <details>
              <summary className="cursor-pointer text-muted-foreground">Snippets</summary>
              <dl className="mt-1 flex flex-col gap-1 font-mono text-[11px]">
                {Object.entries(data.snippets).map(([name, text]) => (
                  <div key={name}>
                    <dt className="text-emerald-700 dark:text-emerald-300">[[{name}]]</dt>
                    <dd className="whitespace-pre-wrap break-words pl-3">{highlightTemplate(text)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}
          {switches.map(([question, alternatives]) => (
            <Choice
              key={question}
              label={`Answer to ${question}`}
              options={alternatives.map((a) => ({ value: a, label: a === null ? "not answered" : String(a) }))}
              value={chosen[question]}
              onChange={(value) => setChosen((c) => ({ ...c, [question]: value }))}
            />
          ))}
          {data.steps.length > 0 && (
            <Choice label="Question on screen" options={data.steps.map((s) => ({ value: s, label: s }))} value={step} onChange={setStep} />
          )}
        </div>
      )}

      <div className="border-t border-border bg-background p-4">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What the coder sees</div>
        {result === null ? (
          <p className="text-xs text-muted-foreground">Rendering…</p>
        ) : "error" in result ? (
          <p className="text-xs text-destructive">{result.error}</p>
        ) : (
          <UnitFields layout={{ template }} rendered={result.rendered} />
        )}
      </div>
    </div>
  );
}

function Choice<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-muted-foreground">{label}:</span>
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "cursor-pointer rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors",
            o.value === value ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
