import { useState, useEffect, useRef, useMemo } from "react";
import type {
  CodebookItem,
  TopLevelItem,
  InLoopItem,
  CodebookValidationIssue,
} from "@annotinder/contracts";
import {
  Repeat,
  GitBranch,
  HelpCircle,
  Plus,
  Trash2,
  Move,
  X,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import {
  canMoveItemTo,
  canMoveToRootEnd,
  type MoveTargetPosition,
} from "../../codebook/codebookEdit";
import { isInsideUnitLoop, flattenTree } from "../../codebook/tree";

function ItemIcon({ type }: { type: CodebookItem["type"] }) {
  switch (type) {
    case "unit_loop":
      return <Repeat className="h-4 w-4 text-primary shrink-0" />;
    case "condition":
      return <GitBranch className="h-4 w-4 text-amber-500 shrink-0" />;
    case "question":
    case "unit_variable":
    case "user_variable":
      return <HelpCircle className="h-4 w-4 text-blue-500 shrink-0" />;
  }
}

interface TypeSelectDropdownProps {
  allowedTypes: CodebookItem["type"][];
  onSelect: (type: CodebookItem["type"]) => void;
  onClose: () => void;
  triggerId?: string;
  align?: "left" | "right";
}

function TypeSelectDropdown({
  allowedTypes,
  onSelect,
  onClose,
  triggerId,
  align = "right",
}: TypeSelectDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        if (triggerId) {
          const target = e.target as HTMLElement;
          if (target.closest(`[data-slot-trigger="${triggerId}"]`)) {
            return;
          }
        }
        onClose();
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, triggerId]);

  const typeLabels: Record<string, { label: string; desc: string; icon: any }> = {
    question: {
      label: "Question",
      desc: "Prompt coder for an answer",
      icon: HelpCircle,
    },
    unit_loop: {
      label: "Unit Loop",
      desc: "Loop over units in a unitset",
      icon: Repeat,
    },
    condition: {
      label: "Condition",
      desc: "Branch based on JS expression",
      icon: GitBranch,
    },
  };

  return (
    <div
      ref={dropdownRef}
      className={`absolute ${align === "left" ? "left-0" : "right-0"} top-full mt-1 z-50 min-w-48 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95`}
    >
      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Select Item Type
      </div>
      {allowedTypes.map((type) => {
        const info = typeLabels[type];
        if (!info) return null;
        const Icon = info.icon;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-xs font-medium hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          >
            <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
            <div>
              <div className="font-semibold text-foreground">{info.label}</div>
              <div className="text-[10px] text-muted-foreground font-normal">{info.desc}</div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function InsertionArrowIndicator({ depth }: { depth: number }) {
  return (
    <div
      className="absolute -top-0.5 flex items-center pointer-events-none z-20 animate-in fade-in-0 duration-150"
      style={{ left: depth * 20 + 2 }}
    >
      <ArrowRight className="h-3.5 w-3.5 text-primary stroke-[2.5]" />
    </div>
  );
}

function getLastDescendantKey(node: TopLevelItem | InLoopItem): string {
  if ("children" in node && Array.isArray((node as any).children) && (node as any).children.length > 0) {
    const children = (node as any).children;
    return getLastDescendantKey(children[children.length - 1]);
  }
  return (node as any)._key || node.name;
}

interface CodebookTreeViewProps {
  items: TopLevelItem[];
  selected: string | null;
  onSelect: (identifier: string) => void;
  onInsertBefore: (targetIdentifier: string, type: CodebookItem["type"]) => void;
  onInsertAtEnd: (parentIdentifier: string | null, type: CodebookItem["type"]) => void;
  onDelete: (identifier: string) => void;
  onMoveItem: (source: string, target: string, position: MoveTargetPosition) => void;
  onMoveToRootEnd: (source: string) => void;
  validationIssues?: CodebookValidationIssue[];
}

/**
 * Renders the codebook items as a sleek, compact hierarchical tree view:
 * - Extremely compact item heights (h-[30px]) with zero gap between items.
 * - On hovering the insert button or move target, all item names and subsequent add buttons downward slide down in unison.
 * - Lowered insertion right arrow indicator (→) pointing directly into the opened gap.
 * - In move mode, no green background/border on moving item; clicking current or invalid target cancels move.
 * - Selected item is visually indicated via a compact title chip over the item name.
 * - End-of-list target shows stationary "Move here" button.
 */
export function CodebookTreeView({
  items,
  selected,
  onSelect,
  onInsertBefore,
  onInsertAtEnd,
  onDelete,
  onMoveItem,
  onMoveToRootEnd,
  validationIssues = [],
}: CodebookTreeViewProps) {
  const [movingItem, setMovingItem] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [hoveredAddKey, setHoveredAddKey] = useState<string | null>(null);
  const [hoveredMoveTarget, setHoveredMoveTarget] = useState<string | null>(null);

  const isMoveMode = movingItem !== null;

  const flatItems = useMemo(() => flattenTree(items), [items]);
  const flatKeys = useMemo(
    () => flatItems.map((item) => (item as any)._key || item.name),
    [flatItems],
  );

  const activeHoverKey = !isMoveMode ? hoveredAddKey : hoveredMoveTarget;
  const activeHoverIndex = activeHoverKey ? flatKeys.indexOf(activeHoverKey) : -1;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && movingItem) {
        setMovingItem(null);
        setHoveredMoveTarget(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [movingItem]);

  function handleExecuteMove(targetIdentifier: string, position: MoveTargetPosition) {
    if (!movingItem) return;
    onMoveItem(movingItem, targetIdentifier, position);
    setMovingItem(null);
    setHoveredMoveTarget(null);
  }

  function handleExecuteMoveToRootEnd() {
    if (!movingItem) return;
    onMoveToRootEnd(movingItem);
    setMovingItem(null);
    setHoveredMoveTarget(null);
  }

  function getItemIssue(item: CodebookItem): string | null {
    const issue = validationIssues.find((i) => {
      if (item.name && i.message.includes(`'${item.name}'`)) return true;
      return false;
    });
    return issue ? issue.message : null;
  }

  function renderList(
    nodes: (TopLevelItem | InLoopItem)[],
    depth: number,
    parentContainer: (TopLevelItem | InLoopItem) | null,
  ) {
    const isRoot = parentContainer === null;
    const parentKey = parentContainer ? (parentContainer as any)._key || parentContainer.name : null;
    const listId = isRoot ? "root" : parentKey;
    const isParentInLoop =
      parentContainer !== null &&
      (parentContainer.type === "unit_loop" || isInsideUnitLoop(items, parentKey));
    const allowedTypesForList: CodebookItem["type"][] = isParentInLoop
      ? ["question", "condition"]
      : ["question", "unit_loop", "condition"];

    const canMoveToEnd = isMoveMode
      ? isRoot
        ? canMoveToRootEnd(items, movingItem!)
        : canMoveItemTo(items, movingItem!, parentKey!, "inside")
      : false;

    const lastItemIndex =
      nodes.length > 0
        ? flatKeys.indexOf(getLastDescendantKey(nodes[nodes.length - 1]))
        : parentKey
          ? flatKeys.indexOf(parentKey)
          : -1;

    const shouldShiftEndSlot =
      activeHoverIndex !== -1 && lastItemIndex !== -1 && activeHoverIndex <= lastItemIndex;

    return (
      <div className="flex flex-col">
        {nodes.map((item) => {
          const itemKey = (item as any)._key || item.name;
          const hasChildren = "children" in item && Array.isArray((item as any).children);
          const isMoving = movingItem === itemKey || movingItem === item.name;
          const isSelected = selected === itemKey || selected === item.name;
          const issueMessage = getItemIssue(item);
          const itemInLoop = isInsideUnitLoop(items, itemKey);
          const allowedTypesBefore: CodebookItem["type"][] = itemInLoop
            ? ["question", "condition"]
            : ["question", "unit_loop", "condition"];

          const canMoveBefore =
            isMoveMode &&
            !isMoving &&
            canMoveItemTo(items, movingItem, itemKey, "before");

          const itemIndex = flatKeys.indexOf(itemKey);
          const shouldShiftDown = activeHoverIndex !== -1 && itemIndex >= activeHoverIndex;

          const isHoveredMoveTarget =
            isMoveMode && canMoveBefore && hoveredMoveTarget === itemKey;
          const showAddIndicator = !isMoveMode && hoveredAddKey === itemKey;

          const showIndicator = showAddIndicator || isHoveredMoveTarget;

          return (
            <div key={itemKey} className="relative flex flex-col">
              {/* Arrow insertion indicator at the exact target item */}
              {showIndicator && <InsertionArrowIndicator depth={depth} />}

              {/* Item Card Row */}
              <div
                onMouseEnter={() => {
                  if (isMoveMode && canMoveBefore) {
                    setHoveredMoveTarget(itemKey);
                  }
                }}
                onMouseLeave={() => {
                  if (isMoveMode) {
                    setHoveredMoveTarget((k) => (k === itemKey ? null : k));
                  }
                }}
                onClick={(e) => {
                  if (isMoveMode) {
                    e.stopPropagation();
                    if (canMoveBefore) {
                      handleExecuteMove(itemKey, "before");
                    } else {
                      // Clicking the moving item or an invalid position cancels move mode
                      setMovingItem(null);
                      setHoveredMoveTarget(null);
                    }
                  }
                }}
                className={`group flex h-[30px] items-center justify-between rounded px-2 text-sm border border-transparent transition-colors ${
                  isMoving
                    ? "font-medium text-foreground cursor-pointer opacity-100"
                    : isMoveMode
                      ? canMoveBefore
                        ? "text-foreground cursor-pointer opacity-100"
                        : "text-muted-foreground opacity-30 cursor-pointer select-none"
                      : "text-muted-foreground hover:text-foreground"
                }`}
                style={{ marginLeft: depth * 20 }}
              >
                {/* Select button / info (all items from the hovered slot downward shift down in unison) */}
                <button
                  type="button"
                  disabled={isMoveMode}
                  onClick={() => {
                    if (!isMoveMode) {
                      onSelect(itemKey);
                    }
                  }}
                  className={`flex flex-1 items-center gap-1.5 text-left overflow-hidden transition-transform duration-150 ${
                    shouldShiftDown ? "translate-y-2" : ""
                  } ${!isMoveMode ? "cursor-pointer" : "pointer-events-none"}`}
                >
                  <ItemIcon type={item.type} />
                  <span
                    className={`truncate rounded px-1.5 py-0.5 transition-colors ${
                      isSelected && !isMoveMode
                        ? "font-semibold text-foreground bg-muted/40"
                        : "font-medium text-foreground"
                    }`}
                  >
                    {item.name || <em className="text-muted-foreground font-normal">(unnamed)</em>}
                  </span>
                  {item.type === "condition" && (
                    <span className="text-xs text-muted-foreground/80 font-mono truncate">
                      if {(item as any).expression}:
                    </span>
                  )}
                  {issueMessage && (
                    <span title={issueMessage} className="text-destructive shrink-0">
                      <AlertCircle className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>

                {/* Normal mode actions (+ Add before, Move, Delete) */}
                {!isMoveMode && (
                  <div
                    className={`flex h-6 items-center gap-0.5 transition-opacity ${
                      activeMenuId === `before_${itemKey}`
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <div className="relative">
                      <button
                        type="button"
                        data-slot-trigger={`before_${itemKey}`}
                        title={`Add item before ${item.name || "item"}`}
                        onMouseEnter={() => setHoveredAddKey(itemKey)}
                        onMouseLeave={() => setHoveredAddKey(null)}
                        onClick={() => {
                          setActiveMenuId(
                            activeMenuId === `before_${itemKey}` ? null : `before_${itemKey}`,
                          );
                          setHoveredAddKey(null);
                        }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      {activeMenuId === `before_${itemKey}` && (
                        <TypeSelectDropdown
                          triggerId={`before_${itemKey}`}
                          allowedTypes={allowedTypesBefore}
                          align="right"
                          onSelect={(type) => {
                            onInsertBefore(itemKey, type);
                            setActiveMenuId(null);
                            setHoveredAddKey(null);
                          }}
                          onClose={() => {
                            setActiveMenuId(null);
                            setHoveredAddKey(null);
                          }}
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      title="Move item"
                      onClick={() => {
                        setMovingItem(itemKey);
                        setHoveredAddKey(null);
                        setActiveMenuId(null);
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <Move className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete item"
                      className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive cursor-pointer"
                      onClick={() => onDelete(itemKey)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Move mode active indicator on moving item */}
                {isMoving && (
                  <div className="flex h-6 items-center gap-1.5">
                    <span className="rounded bg-primary/20 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      Moving...
                    </span>
                    <button
                      type="button"
                      title="Cancel move"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMovingItem(null);
                        setHoveredMoveTarget(null);
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {/* Move mode placeholder on non-moving items to keep geometry 100% constant */}
                {isMoveMode && !isMoving && (
                  <div className="flex h-6 items-center gap-0.5 invisible pointer-events-none" aria-hidden="true" />
                )}
              </div>

              {/* Children recursive list */}
              {hasChildren && (
                <div>
                  {renderList(
                    (item as { children: InLoopItem[] }).children,
                    depth + 1,
                    item,
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* End of list */}
        {isMoveMode ? (
          canMoveToEnd ? (
            <div className="py-0.5" style={{ paddingLeft: depth * 20 }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isRoot) handleExecuteMoveToRootEnd();
                  else handleExecuteMove(parentKey!, "inside");
                }}
                className={`flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10 transition-transform duration-150 cursor-pointer ${
                  shouldShiftEndSlot ? "translate-y-2" : ""
                }`}
              >
                <ArrowRight className="h-3 w-3" />
                <span>Move here</span>
              </button>
            </div>
          ) : (
            <div className="py-0.5 invisible pointer-events-none" style={{ paddingLeft: depth * 20 }} aria-hidden="true">
              <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
                <div className="h-3 w-3" />
                <span>Move here</span>
              </div>
            </div>
          )
        ) : (
          <div className="py-0.5" style={{ paddingLeft: depth * 20 }}>
            <div
              className={`relative inline-block transition-transform duration-150 ${
                shouldShiftEndSlot ? "translate-y-2" : ""
              }`}
            >
              <button
                type="button"
                data-slot-trigger={`end_${listId}`}
                title={`Add item to ${isRoot ? "codebook" : parentContainer?.name || "container"}`}
                onClick={() =>
                  setActiveMenuId(activeMenuId === `end_${listId}` ? null : `end_${listId}`)
                }
                className="flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs text-muted-foreground/70 hover:text-foreground transition-colors cursor-pointer"
              >
                <Plus className="h-3 w-3" />
                <span>Add item</span>
              </button>
              {activeMenuId === `end_${listId}` && (
                <TypeSelectDropdown
                  triggerId={`end_${listId}`}
                  allowedTypes={allowedTypesForList}
                  align="left"
                  onSelect={(type) => {
                    onInsertAtEnd(parentKey, type);
                    setActiveMenuId(null);
                  }}
                  onClose={() => setActiveMenuId(null)}
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => {
        if (isMoveMode) {
          setMovingItem(null);
          setHoveredMoveTarget(null);
        }
      }}
      className="flex flex-col p-1 pb-3"
    >
      {renderList(items, 0, null)}
    </div>
  );
}
