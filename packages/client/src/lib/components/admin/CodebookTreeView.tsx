import type { CodebookItem } from "@annotinder/contracts";
import { parentPosition } from "@annotinder/contracts";
import { getChildren, getRootItems } from "../../codebook/tree";
import {
  Repeat,
  GitBranch,
  CheckSquare,
  HelpCircle,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

function ItemIcon({ type }: { type: CodebookItem["type"] }) {
  switch (type) {
    case "unit_loop":
      return <Repeat className="h-4 w-4 text-primary shrink-0" />;
    case "condition":
      return <GitBranch className="h-4 w-4 text-amber-500 shrink-0" />;
    case "unit_variable":
      return <CheckSquare className="h-4 w-4 text-teal-600 shrink-0" />;
    case "user_variable":
      return <HelpCircle className="h-4 w-4 text-blue-500 shrink-0" />;
  }
}

/**
 * Renders the codebook items as a clean, hierarchical tree view.
 * Positions (2, 2.1) and verbose type labels are omitted for a simplified,
 * readable item list.
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
          className={`group flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors hover:bg-muted/70 ${
            selected === item.position ? "bg-muted font-medium text-foreground shadow-sm" : "text-muted-foreground"
          }`}
          style={{ marginLeft: depth * 18 }}
        >
          <button
            type="button"
            className="flex flex-1 items-center gap-2 text-left cursor-pointer overflow-hidden"
            onClick={() => onSelect(item.position)}
          >
            <ItemIcon type={item.type} />
            <span className="truncate text-foreground font-medium">{item.name}</span>
          </button>

          <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              title="Move up"
              disabled={index === 0}
              onClick={() => onMoveUp(item.position)}
              className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:hover:bg-transparent"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Move down"
              disabled={index === siblings.length - 1}
              onClick={() => onMoveDown(item.position)}
              className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:hover:bg-transparent"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Indent (make child of previous sibling)"
              disabled={index === 0}
              onClick={() => onIndent(item.position)}
              className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:hover:bg-transparent"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              title="Outdent"
              disabled={parentPosition(item.position) === null}
              onClick={() => onOutdent(item.position)}
              className="p-1 rounded hover:bg-background text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:hover:bg-transparent"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            {(item.type === "unit_loop" || item.type === "condition") && (
              <button
                type="button"
                title="Add child item"
                onClick={() => onAddChild(item.position)}
                className="p-1 rounded hover:bg-background text-primary hover:text-primary/80"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              title="Delete item"
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(item.position)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {renderLevel(item.position, depth + 1)}
      </div>
    ));
  }

  return <div className="flex flex-col gap-1">{renderLevel(null, 0)}</div>;
}
