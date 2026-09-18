import type { CodebookItem } from "@annotinder/contracts";
import { parentPosition } from "@annotinder/contracts";
import { getChildren, getRootItems } from "../../codebook/tree";

const TYPE_LABELS: Record<CodebookItem["type"], string> = {
  user_variable: "User variable",
  unit_variable: "Unit variable",
  unit_loop: "Unit loop",
  condition: "Condition",
};

function itemSummary(item: CodebookItem): string {
  if (item.type === "user_variable" || item.type === "unit_variable") return item.variable.type;
  if (item.type === "unit_loop") return `unitset: ${item.unitset || "(none)"}`;
  return item.expression || "(empty)";
}

/**
 * Renders the codebook's flat positional item array as an indented tree
 * (design plan §5.2), with keyboard/button-driven reordering (move up/down,
 * indent/outdent) instead of drag-and-drop or the old app's click-to-move
 * interaction -- simpler to implement correctly on top of the new flat
 * position-string model (§2) and more keyboard-accessible.
 */
export function CodebookTreeView({
  items,
  selected,
  onSelect,
  onAddChild,
  onDelete,
  onMoveUp,
  onMoveDown,
  onIndent,
  onOutdent,
}: {
  items: CodebookItem[];
  selected: string | null;
  onSelect: (position: string) => void;
  onAddChild: (parent: string) => void;
  onDelete: (position: string) => void;
  onMoveUp: (position: string) => void;
  onMoveDown: (position: string) => void;
  onIndent: (position: string) => void;
  onOutdent: (position: string) => void;
}) {
  function renderLevel(parent: string | null, depth: number) {
    const siblings = parent === null ? getRootItems(items) : getChildren(items, parent);
    return siblings.map((item, index) => (
      <div key={item.position}>
        <div
          className={`flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted ${
            selected === item.position ? "bg-muted" : ""
          }`}
          style={{ marginLeft: depth * 20 }}
        >
          <button type="button" className="flex-1 text-left" onClick={() => onSelect(item.position)}>
            <span className="text-muted-foreground">{item.position}</span> <strong>{item.name}</strong>{" "}
            <span className="text-muted-foreground">
              [{TYPE_LABELS[item.type]}] {itemSummary(item)}
            </span>
          </button>
          <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
            <button type="button" title="Move up" disabled={index === 0} onClick={() => onMoveUp(item.position)}>
              ↑
            </button>
            <button
              type="button"
              title="Move down"
              disabled={index === siblings.length - 1}
              onClick={() => onMoveDown(item.position)}
            >
              ↓
            </button>
            <button type="button" title="Indent (make child of previous sibling)" disabled={index === 0} onClick={() => onIndent(item.position)}>
              →
            </button>
            <button
              type="button"
              title="Outdent"
              disabled={parentPosition(item.position) === null}
              onClick={() => onOutdent(item.position)}
            >
              ←
            </button>
            {(item.type === "unit_loop" || item.type === "condition") && (
              <button type="button" title="Add child item" onClick={() => onAddChild(item.position)}>
                +
              </button>
            )}
            <button type="button" title="Delete" className="hover:text-destructive" onClick={() => onDelete(item.position)}>
              ✕
            </button>
          </div>
        </div>
        {renderLevel(item.position, depth + 1)}
      </div>
    ));
  }

  return <div className="flex flex-col gap-0.5">{renderLevel(null, 0)}</div>;
}
