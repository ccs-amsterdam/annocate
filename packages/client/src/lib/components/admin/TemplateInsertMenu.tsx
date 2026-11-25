import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AnyVariableType, Condition } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConditionEditor } from "./ConditionEditor";
import type { TemplateEditorApi } from "./jsonEditor/TemplateCodeEditor";
import { InsertMenu, InsertSectionList } from "./templateInsert/InsertMenu";
import { block, insertSections, type SectionKey } from "./templateInsert/sections";

/**
 * "Insert" above the unit template: unit fields (as headline, text or
 * image), "Show if…" (a condition from the rules
 * editor), "Show from…" (a question of the loop) and styles. Blocks wrap
 * the selected text. The text stays the source of truth: this only writes
 * it (docs/client.md §7, "Unit loops").
 */
export function TemplateInsertMenu({
  editor,
  fields,
  loopQuestions,
  questions,
  snippets,
}: {
  editor: TemplateEditorApi | null;
  fields: string[];
  loopQuestions: string[];
  /** Questions a `::: if` may use. */
  questions: { name: string; variable: AnyVariableType }[];
  /** The loop's snippets. */
  snippets: string[];
}) {
  // Closed, the first list, or one of its sections
  const [step, setStep] = useState<"menu" | SectionKey | null>(null);
  const [condition, setCondition] = useState<Condition | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  // Open: pressing outside the menu closes it
  useEffect(() => {
    if (step === null) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setStep(null);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [step]);
  const sections = insertSections({ fields, loopQuestions, snippets });

  const insert = (snippet: string) => {
    setStep(null);
    editor?.insertSnippet(snippet);
  };
  const askCondition = () => {
    setStep(null);
    setCondition({ script: "" });
  };

  return (
    <div ref={ref} className="relative">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        disabled={!editor}
        onClick={() => setStep(step ? null : "menu")}
      >
        Insert <ChevronDown className="ml-1 h-3.5 w-3.5" />
      </Button>
      {step && (
        <div className="absolute top-full right-0 z-50 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          {step === "menu" ? (
            <InsertMenu sections={sections} onOpen={setStep} onCondition={askCondition} onInsert={insert} />
          ) : (
            <InsertSectionList section={sections[step]} onBack={() => setStep("menu")} onInsert={insert} />
          )}
        </div>
      )}

      <ConditionDialog
        condition={condition}
        questions={questions}
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
  title,
  action,
  onClose,
  onDone,
}: {
  /** The condition being edited; null: closed. */
  condition: Condition | null;
  questions: { name: string; variable: AnyVariableType }[];
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
        <ConditionEditor condition={draft} onChange={setDraft} questions={questions} loop />
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
