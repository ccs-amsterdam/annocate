import type { DesignItem } from "@annotinder/contracts";
import { Input } from "@/components/ui/input";
import { HelpButton } from "../../../help/HelpButton";
import { withOptional } from "../../../design/itemSettings";

// What an item is called: questions, experiments and end items have a name
// (answers and references use it); branches, unit loops and layouts an
// optional label for the researcher.

type NamedItem = Extract<DesignItem, { type: "question" | "experiment" | "end" }>;
type LabelledItem = Extract<DesignItem, { type: "branch" | "unit_loop" | "layout" }>;

const NAME_HELP: Record<NamedItem["type"], string> = {
  question: "questions",
  experiment: "random-condition",
  end: "end-items",
};

const LABELS: Record<LabelledItem["type"], { help: string; placeholder: string }> = {
  branch: { help: "conditions", placeholder: "e.g. Screen-out" },
  layout: { help: "layout-templates", placeholder: "e.g. With the full text" },
  unit_loop: { help: "unit-loops", placeholder: "e.g. News items" },
};

/** The name of a question, experiment or end item. */
export function NameField({
  item,
  error,
  onChange,
}: {
  item: NamedItem;
  /** What validation says about the name. */
  error: string | null;
  onChange: (updated: DesignItem) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5">
        <label className="text-xs font-semibold text-foreground">Item Name</label>
        <HelpButton topic={NAME_HELP[item.type]} label="Help" />
      </span>
      <Input
        value={item.name}
        onChange={(e) => onChange({ ...item, name: e.target.value })}
        placeholder="e.g. sentiment, age"
        className={error ? "border-destructive focus-visible:ring-destructive" : ""}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

/** Branches, unit loops and layouts have no name: an optional label shows in the tree (and for loops in exports). */
export function LabelField({ item, onChange }: { item: LabelledItem; onChange: (updated: DesignItem) => void }) {
  const { help, placeholder } = LABELS[item.type];
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5">
        <label className="text-xs font-semibold text-foreground">Label (optional)</label>
        <HelpButton topic={help} label="Help" />
      </span>
      <Input
        value={item.label ?? ""}
        onChange={(e) => onChange(withOptional(item, "label", e.target.value || undefined))}
        placeholder={placeholder}
      />
    </div>
  );
}
