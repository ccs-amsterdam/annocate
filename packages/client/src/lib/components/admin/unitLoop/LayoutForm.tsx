import { useState, type ReactNode } from "react";
import { Code, Plus, Trash2 } from "lucide-react";
import { cn } from "cn";
import {
  type AnyVariableType,
  type DesignItem,
  type DesignIssue,
  type LayoutItem,
  UNIT_BUILTINS,
} from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TemplateCodeEditor, type TemplateEditorApi } from "../jsonEditor/TemplateCodeEditor";
import { ConditionDialog, TemplateInsertMenu } from "../TemplateInsertMenu";
import { MarkdownToolbar } from "../MarkdownField";
import { IssueList } from "../IssueList";
import { parseSimpleLayout, simpleTemplate, type SimpleLayout } from "../../../design/simpleLayout";
import { LayoutDesigner } from "../LayoutDesigner";
import { questionNames, questionsOf } from "./helpers";
import { Section } from "./Section";
import { HighlightsSection } from "./HighlightsSection";
import { withHighlights, withSnippets } from "../../../design/itemSettings";

// A layout item's form: how a unit is shown from there on (template, snippets).

type Question = { name: string; variable: AnyVariableType };

interface LayoutFormProps {
  layout: LayoutItem;
  /** The items of the loop it is in (its questions, for `::: from` and conditions). */
  loopItems: DesignItem[];
  unitFields: string[];
  coderQuestions: Question[];
  issues: DesignIssue[];
  readOnly: boolean;
  onChange: (layout: LayoutItem) => void;
}

/** How a unit is shown: a simple form (title, byline, body), or the markdown template and its snippets. */
export function LayoutForm(props: LayoutFormProps) {
  const { layout, unitFields, issues, readOnly, onChange } = props;
  // The simple form (title, byline, body) unless the template is more than it can show, or the researcher chose to write it.
  const simple = parseSimpleLayout(layout.template);
  const [advanced, setAdvanced] = useState(simple === null);
  const setTemplate = (template: string) => onChange({ ...layout, template });
  const highlights = (
    <HighlightsSection
      highlights={layout.highlight}
      unitFields={unitFields}
      readOnly={readOnly}
      onChange={(next) => onChange(withHighlights(layout, next))}
    />
  );

  if (!advanced && simple) {
    return (
      <SimpleLayoutForm
        layout={layout}
        simple={simple}
        // `$unit.id` and `$unit.test_set` are each unit's (unless fields have these names)
        fields={[...new Set([...unitFields, ...UNIT_BUILTINS])]}
        issues={issues}
        readOnly={readOnly}
        highlights={highlights}
        onTemplate={setTemplate}
        onAdvanced={() => setAdvanced(true)}
      />
    );
  }
  return (
    <AdvancedLayoutForm
      {...props}
      highlights={highlights}
      onTemplate={setTemplate}
      // To the simple form: as it is if the template fits it, else (after asking) with an empty sketch
      toSimple={{ fits: simple !== null, go: () => setAdvanced(false) }}
    />
  );
}

/** The simple form: a title, byline and body placed in a sketch of the unit. */
function SimpleLayoutForm({
  layout,
  simple,
  fields,
  issues,
  readOnly,
  highlights,
  onTemplate,
  onAdvanced,
}: {
  layout: LayoutItem;
  simple: SimpleLayout;
  fields: string[];
  issues: DesignIssue[];
  readOnly: boolean;
  highlights: ReactNode;
  onTemplate: (template: string) => void;
  onAdvanced: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Section title="Layout" help="What coders see of each unit, from here on." topic="layout-templates">
        {readOnly ? (
          <pre className="rounded-md border border-input p-2 font-mono text-xs whitespace-pre-wrap">
            {layout.template}
          </pre>
        ) : (
          <LayoutDesigner layout={simple} fields={fields} onChange={(next) => onTemplate(simpleTemplate(next))} />
        )}
        <IssueList issues={issues} />
      </Section>
      {highlights}
      <button
        type="button"
        onClick={onAdvanced}
        className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <Code className="h-3.5 w-3.5" /> Advanced: write the layout as a template (markdown, blocks, styles, snippets)…
      </button>
    </div>
  );
}

/** The way from the template to the simple form. */
function ToSimpleButton({
  fits,
  go,
  onTemplate,
}: {
  /** The template is one the simple form can show. */
  fits: boolean;
  go: () => void;
  onTemplate: (template: string) => void;
}) {
  const className = "cursor-pointer text-xs text-muted-foreground hover:text-foreground";
  if (fits)
    return (
      <button type="button" onClick={go} className={className}>
        ← Simple form
      </button>
    );
  return (
    <button
      type="button"
      title="Replaces this template with a title, byline and body chosen in a form"
      onClick={() => {
        if (!confirm("Replace this template with the simple form (title, byline, body)?")) return;
        // An empty sketch: the researcher places the fields
        onTemplate("");
        go();
      }}
      className={className}
    >
      Use the simple form instead…
    </button>
  );
}

/** The layout written as a template: markdown with blocks, conditions and styles, and its snippets. */
function AdvancedLayoutForm({
  layout,
  loopItems,
  unitFields,
  coderQuestions,
  issues,
  readOnly,
  onChange,
  highlights,
  onTemplate,
  toSimple,
}: LayoutFormProps & {
  highlights: ReactNode;
  onTemplate: (template: string) => void;
  toSimple: { fits: boolean; go: () => void };
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

  return (
    <div className="flex flex-col gap-5">
      {!readOnly && (
        <div className="-mb-3 flex items-center justify-between gap-2">
          <ToSimpleButton {...toSimple} onTemplate={onTemplate} />
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
            onChange={onTemplate}
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

      {highlights}
      {/* Optional: open by itself when in use */}
      <details className="group rounded-md border border-border/70 px-3 py-2" open={snippets.length > 0}>
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none hover:text-foreground">
          More layout options: snippets
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          <SnippetsSection snippets={snippets} onChange={(entries) => onChange(withSnippets(layout, entries))} />
        </div>
      </details>
    </div>
  );
}

/** A layout's snippets: named texts the template inserts with `[[name]]`. */
function SnippetsSection({
  snippets,
  onChange: setSnippets,
}: {
  snippets: [string, string][];
  onChange: (snippets: [string, string][]) => void;
}) {
  return (
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
  );
}
