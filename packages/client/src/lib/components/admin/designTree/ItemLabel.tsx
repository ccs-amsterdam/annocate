import { createElement } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "cn";
import { parseSimpleCondition, type Condition } from "@annotinder/contracts";
import { Leaf } from "@/components/Logo";
import { describeCondition } from "../../../codebook/conditions";
import { loopUnitsSummary } from "../../../codebook/tree";
import { layoutNames } from "../../../design/loopLayouts";
import { ITEM_TYPES, answerTypeWord } from "./itemTypes";
import { itemCondition, itemLabelText } from "./rowLabels";
import { Knot } from "./TreeRow";
import type { TreeNode } from "./utils";

/** What an item's row says: its icon, name, condition, marks (to specify, changed, an issue) and, on the right, what it holds. */
export function ItemLabel({
  item,
  onLine,
  selected,
  issue,
  changed,
}: {
  item: TreeNode;
  /** Its knot is on the line (a loop's, a layout's in its loop): no icon here. */
  onLine: boolean;
  selected: boolean;
  issue: string | null;
  changed: boolean;
}) {
  // Next to the label (e.g. "Social media use · if use_social is true")
  const condition = itemCondition(item);
  return (
    <>
      {!onLine && <ItemIcon item={item} />}
      <ItemName item={item} selected={selected} />
      {item.type === "unit_loop" && (
        <span className="min-w-0 truncate px-1 text-[10px] font-semibold tracking-wider text-wood uppercase">
          for each unit
        </span>
      )}
      {condition && <ConditionText condition={condition} />}
      {"variable" in item && item.variable?.type === "unspecified" && (
        <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
          to specify
        </span>
      )}
      {changed && (
        <span
          title="Unsaved changes"
          aria-label="Unsaved changes"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
        />
      )}
      {issue && (
        <span title={issue} className="shrink-0 text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
        </span>
      )}
      <ItemMeta item={item} />
    </>
  );
}

/** The item's name; a branch without one shows only its condition. */
function ItemName({ item, selected }: { item: TreeNode; selected: boolean }) {
  const text = itemLabelText(item);
  if (text === null && item.type === "branch") return null;
  return (
    <span
      className={cn(
        "truncate px-1 py-0.5",
        ITEM_TYPES[item.type].nameClass,
        selected && "font-semibold",
        // A loop's name before its "for each unit" and units, which give way first
        item.type === "unit_loop" && "shrink-0 text-[15px]",
      )}
    >
      {text ?? <em className="font-normal text-muted-foreground">(unnamed)</em>}
    </span>
  );
}

function ConditionText({ condition }: { condition: Condition }) {
  return (
    <span
      className={cn(
        "truncate px-1 text-muted-foreground",
        parseSimpleCondition(condition.script) ? "text-xs" : "font-mono text-[11px]",
      )}
      title={condition.script}
    >
      if {describeCondition(condition)}
    </span>
  );
}

const META_CLASS = "ml-auto shrink-0 pl-2 text-[11px] text-muted-foreground";

/** On the right of the item: a question's answer type, a layout's fields, a loop's units, an experiment's conditions. */
function ItemMeta({ item }: { item: TreeNode }) {
  switch (item.type) {
    case "question":
      return <span className={META_CLASS}>{answerTypeWord(item)}</span>;
    case "unit_loop":
      return <span className={cn(META_CLASS, "min-w-0 shrink truncate")}>{loopUnitsSummary(item)}</span>;
    case "experiment": {
      const conditions = item.variable.options?.map((o) => o.value).join(" or ");
      return conditions ? <span className={cn(META_CLASS, "min-w-0 shrink truncate")}>{conditions}</span> : null;
    }
    case "layout":
      return <LayoutFields layout={item} />;
    default:
      return null;
  }
}

/** What a layout shows: unit fields and answers, by their names. */
function LayoutFields({ layout }: { layout: Extract<TreeNode, { type: "layout" }> }) {
  const fields = layoutNames(layout).shown.map((name) => name.replace(/^(unit|var)\./, ""));
  // An empty layout: the questions after it show without the unit
  if (fields.length === 0 && !layout.template?.trim()) return <span className={META_CLASS}>unit not shown</span>;
  return (
    <span className="ml-auto flex min-w-0 shrink gap-1 overflow-hidden pl-2" title={fields.join(", ")}>
      {fields.map((field) => (
        <span key={field} className="shrink-0 rounded bg-wood/10 px-1.5 text-[11px] text-wood">
          {field}
        </span>
      ))}
    </span>
  );
}

/** A question is a leaf at the end of its twig; other items their type's icon; a branch none (its twig leads into its label). */
function ItemIcon({ item }: { item: TreeNode }) {
  const { label, color, icon, knotClass } = ITEM_TYPES[item.type];
  if (item.type === "branch") return null;
  if (item.type === "question") return <Leaf className={cn("shrink-0", color)} />;
  // Off its loop's line (in a branch): the knot as the icon
  if (knotClass) return <Knot icon={icon} className={cn("relative shrink-0", knotClass)} iconClass={color} />;
  return (
    <span title={label} className="shrink-0">
      {createElement(icon, { className: cn("h-4 w-4", color) })}
    </span>
  );
}

/** A loop's or layout's knot on the line. */
export function ItemKnot({ item }: { item: TreeNode }) {
  const { icon, color, knotClass } = ITEM_TYPES[item.type];
  return <Knot icon={icon} className={knotClass} iconClass={color} />;
}
