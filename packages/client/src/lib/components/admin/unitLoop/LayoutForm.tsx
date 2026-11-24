import { useState } from "react";
import { Code, Plus, Trash2 } from "lucide-react";
import { cn } from "cn";
import {
  type AnyVariableType,
  type DesignItem,
  type DesignIssue,
  type LayoutItem,
  type UnitLayout,
  UNIT_BUILTINS,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TemplateCodeEditor, type TemplateEditorApi } from "../jsonEditor/TemplateCodeEditor";
import { ConditionDialog, TemplateInsertMenu } from "../TemplateInsertMenu";
import { MarkdownToolbar } from "../MarkdownField";
import { IssueList } from "../IssueList";
import { parseSimpleLayout, simpleTemplate } from "../../../design/simpleLayout";
import { LayoutDesigner } from "../LayoutDesigner";
import { questionNames, questionsOf } from "./helpers";
import { Section } from "./Section";

// A layout item's form: how a unit is shown from there on (template, snippets).

/** How a unit is shown: a simple form (title, byline, body), or the markdown template and its snippets. */
export function LayoutForm({
  layout,
  loopItems,
  unitFields,
  coderQuestions,
  issues,
  readOnly,
  onChange,
}: {
  layout: LayoutItem;
  /** The items of the loop it is in (its questions, for `::: from` and conditions). */
  loopItems: DesignItem[];
  unitFields: string[];
  coderQuestions: { name: string; variable: AnyVariableType }[];
  issues: DesignIssue[];
  readOnly: boolean;
  onChange: (layout: LayoutItem) => void;
}) {
  const snippets = Object.entries(layout.snippets ?? {});
  const loopQuestions = questionNames(loopItems);
  // `::: if` in the layout may use coder-level questions, and (inside `::: from`) the loop's own.
  const conditionQuestions = [...coderQuestions, ...questionsOf(loopItems)];
  const names = {
    // `$unit.id` and `$unit.test_set` are each unit's (unless fields have these names)
    fields: [...new Set([...unitFields, ...UNIT_BUILTINS])],
    snippets: snippets.map(([n]) => n),
    questions: conditionQuestions.map((q) => q.name),
    loopQuestions,
  };
  const [editor, setEditor] = useState<TemplateEditorApi | null>(null);
  const [editing, setEditing] = useState<{ condition: { script: string }; apply: (script: string) => void } | null>(
    null,
  );
  // The simple form (title, byline, body) unless the template is more than it can show, or the researcher chose to write it.
  const simple = parseSimpleLayout(layout.template);
  const [advanced, setAdvanced] = useState(simple === null);
  const setLayout = (next: Partial<UnitLayout>) => onChange({ ...layout, ...next });
  const setSnippets = (entries: [string, string][]) => {
    const next = { ...layout };
    if (entries.length === 0) delete next.snippets;
    else next.snippets = Object.fromEntries(entries);
    onChange(next);
  };

  if (!advanced && simple) {
    return (
      <div className="flex flex-col gap-5">
        <Section title="Layout" help="What coders see of each unit, from here on." topic="layout-templates">
          {readOnly ? (
            <pre className="rounded-md border border-input p-2 font-mono text-xs whitespace-pre-wrap">
              {layout.template}
            </pre>
          ) : (
            <LayoutDesigner
              layout={simple}
              fields={names.fields}
              onChange={(next) => setLayout({ template: simpleTemplate(next) })}
            />
          )}
          <IssueList issues={issues} />
        </Section>
        <button
          type="button"
          onClick={() => setAdvanced(true)}
          className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <Code className="h-3.5 w-3.5" /> Advanced: write the layout as a template (markdown, blocks, styles,
          snippets)…
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {!readOnly && (
        <div className="-mb-3 flex items-center justify-between gap-2">
          {simple ? (
            <button
              type="button"
              onClick={() => setAdvanced(false)}
              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            >
              ← Simple form
            </button>
          ) : (
            <button
              type="button"
              title="Replaces this template with a title, byline and body chosen in a form"
              onClick={() => {
                if (!confirm("Replace this template with the simple form (title, byline, body)?")) return;
                // An empty sketch: the researcher places the fields
                setLayout({ template: "" });
                setAdvanced(false);
              }}
              className="cursor-pointer text-xs text-muted-foreground hover:text-foreground"
            >
              Use the simple form instead…
            </button>
          )}
        </div>
      )}
      <Section title="Template" topic="layout-templates">
        <div
          className={cn(
            "rounded-md border",
            issues.some((i) => !i.warning && !i.path.includes("snippets")) ? "border-destructive" : "border-input",
          )}
        >
          {!readOnly && (
            // Formatting, and the Insert menu (fields, conditions, styles): both write the template
            <MarkdownToolbar
              className="border-b border-input/70 px-1 py-0.5"
              insert={(snippet) => editor?.insertSnippet(snippet)}
            >
              <TemplateInsertMenu
                editor={editor}
                fields={unitFields}
                loopQuestions={loopQuestions}
                questions={conditionQuestions}
                snippets={names.snippets}
              />
            </MarkdownToolbar>
          )}
          <TemplateCodeEditor
            value={layout.template}
            names={names}
            readOnly={readOnly}
            onChange={(template) => setLayout({ template })}
            onReady={setEditor}
            onEditCondition={(script, apply) => setEditing({ condition: { script }, apply })}
          />
        </div>
        <IssueList issues={issues} />
        <ConditionDialog
          condition={editing?.condition ?? null}
          questions={conditionQuestions}
          title="Edit condition"
          action="Apply"
          onClose={() => setEditing(null)}
          onDone={(script) => editing?.apply(script)}
        />
      </Section>

      {/* Optional: open by itself when in use */}
      <details className="group rounded-md border border-border/70 px-3 py-2" open={snippets.length > 0}>
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
          More layout options: snippets
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <Section title="Snippets" topic="snippets">
            {snippets.map(([name, value], i) => (
              <div key={i} className="flex flex-col gap-1 rounded-md border border-border p-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">[[</span>
                  <Input
                    aria-label="Snippet name"
                    className="h-7 w-48 font-mono text-xs"
                    value={name}
                    placeholder="name"
                    onChange={(e) => {
                      const renamed = e.target.value;
                      // A name another snippet has would merge them: not taken.
                      if (snippets.some(([n], j) => j !== i && n === renamed)) return;
                      setSnippets(snippets.map((c, j) => (j === i ? [renamed, c[1]] : c)));
                    }}
                  />
                  <span className="font-mono text-xs text-muted-foreground">]]</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label={`Remove ${name}`}
                    onClick={() => setSnippets(snippets.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Textarea
                  aria-label={`Text of ${name}`}
                  className="field-sizing-content max-h-60 min-h-12 font-mono text-xs"
                  rows={2}
                  value={value}
                  onChange={(e) => setSnippets(snippets.map((c, j) => (j === i ? [c[0], e.target.value] : c)))}
                />
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => {
                let n = snippets.length + 1;
                while (snippets.some(([c]) => c === `snippet_${n}`)) n++;
                setSnippets([...snippets, [`snippet_${n}`, ""]]);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Snippet
            </Button>
          </Section>
        </div>
      </details>
    </div>
  );
}
