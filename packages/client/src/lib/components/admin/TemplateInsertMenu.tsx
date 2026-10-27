import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, Code2, Eye, GitBranch, Heading1, Image, Paintbrush, Text, TextSelect } from "lucide-react";
import type { AnyVariableType, Condition } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConditionEditor } from "./ConditionEditor";
import type { TemplateEditorApi } from "./jsonEditor/TemplateCodeEditor";

/** Text inside a Monaco snippet: `$`, `}` and `\` are literal. */
const literal = (text: string) => text.replace(/[\\$}]/g, (c) => `\\${c}`);
/** A block around the selection (or an empty line for the cursor). */
const block = (fence: string) => `${literal(fence)}\n\${TM_SELECTED_TEXT}$0\n:::`;

const STYLES: { label: string; css: string }[] = [
  { label: "Box", css: "border: 1px solid var(--border); border-radius: 8px; padding: 0.75em 1em" },
  { label: "Small grey text", css: "color: var(--muted-foreground); font-size: 90%" },
  { label: "Large text", css: "font-size: 120%" },
  { label: "Centered", css: "text-align: center" },
  { label: "Custom CSS…", css: "property: value" },
];

type Step = "menu" | "headline" | "text" | "tokenize" | "image" | "from" | "style";

/**
 * "Insert" above the unit template: unit fields (as headline, text,
 * selectable text or image), "Show if…" (a condition from the rules
 * editor), "Show from…" (a question of the loop) and styles. Blocks wrap
 * the selected text. The text stays the source of truth: this only writes
 * it (docs/client.md §7, "Unit loops").
 */
export function TemplateInsertMenu({
  editor,
  fields,
  loopQuestions,
  questions,
  constants,
}: {
  editor: TemplateEditorApi | null;
  fields: string[];
  loopQuestions: string[];
  /** Questions a `::: if` may use. */
  questions: { name: string; variable: AnyVariableType }[];
  constants: string[];
}) {
  const [step, setStep] = useState<Step | null>(null);
  const [condition, setCondition] = useState<Condition | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (step === null) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setStep(null);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [step]);

  const insert = (snippet: string) => {
    setStep(null);
    editor?.insertSnippet(snippet);
  };
  const fieldSnippet: Record<"headline" | "text" | "tokenize" | "image", (f: string) => string> = {
    headline: (f) => `# ${literal(`$unit.${f}`)}\n$0`,
    text: (f) => `${literal(`$unit.${f}`)}\n$0`,
    tokenize: (f) => `${literal(`$unit.${f}::tokenize`)}\n$0`,
    image: (f) => `${literal(`$unit.${f}::image`)}\n$0`,
  };

  const item = (icon: typeof Text, label: string, onClick: () => void, detail?: string) => {
    const Icon = icon;
    return (
      <button
        key={label}
        type="button"
        onClick={onClick}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-muted"
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
        <span className="flex flex-col">
          <span className="font-medium">{label}</span>
          {detail && <span className="text-[10px] text-muted-foreground">{detail}</span>}
        </span>
      </button>
    );
  };
  const back = (title: string) => (
    <div className="flex items-center gap-1 px-1 pb-1">
      <button type="button" title="Back" onClick={() => setStep("menu")} className="cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted">
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</span>
    </div>
  );
  const list = (names: string[], empty: string, pick: (name: string) => void) =>
    names.length === 0 ? (
      <p className="px-2.5 py-1.5 text-xs text-muted-foreground">{empty}</p>
    ) : (
      names.map((name) => item(Code2, name, () => pick(name)))
    );

  return (
    <div ref={ref} className="relative">
      <Button type="button" variant="outline" size="sm" className="h-7 text-xs" disabled={!editor} onClick={() => setStep(step ? null : "menu")}>
        Insert <ChevronDown className="ml-1 h-3.5 w-3.5" />
      </Button>
      {step && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          {step === "menu" && (
            <>
              {item(Heading1, "Headline", () => setStep("headline"), "a unit field as a heading")}
              {item(Text, "Text", () => setStep("text"), "a unit field")}
              {item(TextSelect, "Selectable text", () => setStep("tokenize"), "a unit field span questions can select in")}
              {item(Image, "Image", () => setStep("image"), "a unit field with an image URL")}
              <div className="my-1 border-t border-border" />
              {item(GitBranch, "Show if…", () => {
                setStep(null);
                setCondition({ script: "" });
              }, "only when a condition holds")}
              {item(Eye, "Show from…", () => setStep("from"), "from a question of the loop on")}
              {item(Paintbrush, "Style…", () => setStep("style"), "colours, size, a box")}
            </>
          )}
          {(step === "headline" || step === "text" || step === "tokenize" || step === "image") && (
            <>
              {back("Which field?")}
              {list(fields, "This job's units have no fields yet: upload units first.", (f) => insert(fieldSnippet[step](f)))}
            </>
          )}
          {step === "from" && (
            <>
              {back("From which question?")}
              {list(loopQuestions, "This loop has no questions yet.", (q) => insert(block(`::: from ${q}`)))}
            </>
          )}
          {step === "style" && (
            <>
              {back("Style")}
              {STYLES.map((s) => item(Paintbrush, s.label, () => insert(block(`::: style ${s.css}`)), s.css))}
            </>
          )}
        </div>
      )}

      <ConditionDialog
        condition={condition}
        questions={questions}
        constants={constants}
        title="Show if…"
        action="Insert"
        onClose={() => setCondition(null)}
        onDone={(script) => insert(block(`::: if ${script}`))}
      />
    </div>
  );
}

/** The rules (or script) editor for a block's condition, in a dialog. */
export function ConditionDialog({
  condition,
  questions,
  constants,
  title,
  action,
  onClose,
  onDone,
}: {
  /** The condition being edited; null: closed. */
  condition: Condition | null;
  questions: { name: string; variable: AnyVariableType }[];
  constants: string[];
  title: string;
  action: string;
  onClose: () => void;
  onDone: (script: string) => void;
}) {
  const [draft, setDraft] = useState<Condition>({ script: "" });
  const [shown, setShown] = useState<Condition | null>(null);
  // A new condition to edit: start from it.
  if (condition !== shown) {
    setShown(condition);
    if (condition) setDraft(condition);
  }
  return (
    <Dialog open={condition !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ConditionEditor condition={draft} onChange={setDraft} questions={questions} loop={{ constants }} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!draft.script.trim()}
            onClick={() => {
              onDone(draft.script.trim());
              onClose();
            }}
          >
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
