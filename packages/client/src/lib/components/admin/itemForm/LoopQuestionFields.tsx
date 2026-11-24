import type { AnyVariableType, InLoopQuestionItem } from "@annotinder/contracts";
import { useState } from "react";
import { MarkdownField } from "../MarkdownField";
import { HelpButton } from "../../../help/HelpButton";
import { ToggleChip } from "../variableType/ToggleChip";
import { withInstruction, withOptionals } from "../../../design/itemSettings";

type Focus = { focus?: string[]; focusDim?: boolean };

// The fields only a question in a unit loop has: its instruction, and the
// parts of the unit it is about.

/** "Focus on": the parts of the layout the question is about, by id (docs/client.md §3, "Focus"). */
export function FocusSelect({
  variable,
  loopIds,
  onChange,
}: {
  variable: AnyVariableType;
  loopIds: string[];
  onChange: (variable: AnyVariableType) => void;
}) {
  const focus = ("focus" in variable ? variable.focus : undefined) ?? [];
  const dim = "focusDim" in variable && variable.focusDim === true;
  const ids = [...new Set([...loopIds, ...focus])];
  const set = (next: Focus) => {
    const updated = { focus, focusDim: dim, ...next };
    onChange(
      withOptionals<AnyVariableType & Focus>(variable, {
        focus: updated.focus.length > 0 ? updated.focus : undefined,
        focusDim: updated.focusDim || undefined,
      }),
    );
  };
  const toggle = (id: string) => set({ focus: focus.includes(id) ? focus.filter((f) => f !== id) : [...focus, id] });
  const spanDefault = variable.type === "span" && focus.length === 0;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-foreground">Focus on (optional)</span>
        <HelpButton topic="typed-blocks#ids" label="Help: ids in the layout" />
      </span>
      {ids.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">The layout shows no unit fields or named blocks yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {ids.map((id) => {
            const shown = loopIds.includes(id);
            return (
              <ToggleChip
                key={id}
                on={focus.includes(id)}
                missing={!shown}
                pressed={focus.includes(id)}
                title={shown ? undefined : "The layout doesn't show this"}
                onClick={() => toggle(id)}
              >
                {id}
              </ToggleChip>
            );
          })}
        </div>
      )}
      <label className="flex w-fit items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={dim}
          disabled={focus.length === 0 && !spanDefault}
          onChange={(e) => set({ focusDim: e.target.checked })}
        />
        Dim the rest of the unit
      </label>
      <p className="text-[11px] text-muted-foreground">
        {spanDefault ? "By default the fields it selects in. " : ""}When this question comes up, the unit scrolls to the
        first and highlights it.
      </p>
    </div>
  );
}

/**
 * A loop question's instruction (docs/client.md §4 "Questions and
 * instructions"): how to apply the question to units, which coders open
 * from the question (? button or key) while coding; optionally it opens by
 * itself the first time, or on practice units.
 */
export function InstructionFields({
  item,
  onChange,
}: {
  item: InLoopQuestionItem;
  onChange: (item: InLoopQuestionItem) => void;
}) {
  const set = (patch: Partial<Pick<InLoopQuestionItem, "instruction" | "instructionOpen">>) =>
    onChange(withInstruction(item, patch));
  // Ticked: shown (an empty instruction is none, so the box keeps its own state while it is written)
  const [adding, setAdding] = useState(Boolean(item.instruction));
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-1.5 text-sm font-medium">
        <input
          type="checkbox"
          checked={adding}
          onChange={(e) => {
            setAdding(e.target.checked);
            if (!e.target.checked) set({ instruction: undefined });
          }}
        />
        Add instruction
        <HelpButton topic="questions#instructions" label="Help: instructions" />
      </label>
      {adding && (
        <>
          <MarkdownField
            area
            label="Instruction"
            value={item.instruction ?? ""}
            placeholder="How to apply the question to units, to look up while coding (markdown)"
            onChange={(instruction) => set({ instruction: instruction || undefined })}
          />
          <span className="text-[11px] text-muted-foreground">
            Coders open it with the ? button by the question, or the ? key; a dot points it out until they did.
          </span>
        </>
      )}
      {item.instruction && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Also opens by itself
          <select
            className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            value={item.instructionOpen ?? ""}
            onChange={(e) =>
              set({ instructionOpen: (e.target.value || undefined) as InLoopQuestionItem["instructionOpen"] })
            }
          >
            <option value="">No</option>
            <option value="first">The first time a coder gets the question</option>
            <option value="practice">On practice units</option>
          </select>
        </label>
      )}
    </div>
  );
}
