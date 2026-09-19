import { useState, useEffect } from "react";
import type { CodebookItem, CodebookResponse } from "@annotinder/contracts";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCreateCodebookMutation, useUpdateCodebookMutation, useUnitsetsQuery } from "../../admin/queries";
import { deleteItem, insertItem, moveItem, type NewCodebookItem } from "../../codebook/codebookEdit";
import { parentPosition } from "@annotinder/contracts";
import { getChildren, getRootItems } from "../../codebook/tree";
import { CodebookTreeView } from "./CodebookTreeView";
import { ItemForm, ITEM_TYPE_OPTIONS_IN_LOOP, ITEM_TYPE_OPTIONS_TOP, defaultItemForType } from "./ItemForm";
import { CodebookYamlEditor } from "./CodebookYamlEditor";
import { CodebookPreviewVariable } from "./CodebookPreviewVariable";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sliders, Code2, Eye, Edit3 } from "lucide-react";

/**
 * Whole-document codebook editor (design plan §5.2): holds one in-memory
 * draft (`name` + flat `items` array), edited purely client-side via
 * `codebookEdit.ts`'s pure position-rewriting functions, and saved in one
 * `PUT`/`POST /codebook` call.
 */
export function CodebookEditor({
  client,
  codebook,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  client: AdminClient;
  /** Existing codebook to edit, or null to create a new one. */
  codebook: CodebookResponse | null;
  onSaved: (codebook: CodebookResponse) => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const unitsetsQuery = useUnitsetsQuery(client);
  const createCodebook = useCreateCodebookMutation(client);
  const updateCodebook = useUpdateCodebookMutation(client);

  const [name, setName] = useState(codebook?.name ?? "New codebook");
  const [items, setItems] = useState<CodebookItem[]>(codebook?.items ?? []);
  const [selected, setSelected] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<"visual" | "yaml">("visual");
  const [itemPane, setItemPane] = useState<"edit" | "preview">("edit");
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  const dirty = name !== (codebook?.name ?? "New codebook") || JSON.stringify(items) !== JSON.stringify(codebook?.items ?? []);
  const immutable = codebook?.immutable ?? false;
  const selectedItem = items.find((i) => i.position === selected) ?? null;
  const unitVariableNames = items.filter((i) => i.type === "unit_variable").map((i) => i.name);

  // Notify parent of dirty state
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Warn on browser tab navigation or reload if dirty
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // Find parent unit_loop if selected item is within a loop
  const parentLoop = selectedItem
    ? (items.find(
        (i) => i.type === "unit_loop" && selectedItem.position.startsWith(i.position + "."),
      ) as Extract<CodebookItem, { type: "unit_loop" }> | undefined)
    : undefined;

  function addItem(parent: string | null) {
    const inLoop = parent !== null && isOrInsideUnitLoop(items, parent);
    const type = (inLoop ? ITEM_TYPE_OPTIONS_IN_LOOP[0] : ITEM_TYPE_OPTIONS_TOP[0]) as CodebookItem["type"];
    const name = `item_${items.length + 1}`;
    const next = insertItem(items, defaultItemForType(type, name) as NewCodebookItem, parent);
    setItems(next);
    setSelected(next[next.length - 1].position);
  }

  function changeItemType(position: string, type: CodebookItem["type"]) {
    const item = items.find((i) => i.position === position);
    if (!item) return;
    const withType = { ...defaultItemForType(type, item.name), position } as CodebookItem;
    setItems(items.map((i) => (i.position === position ? withType : i)));
  }

  function handleDelete(position: string) {
    if (!confirm("Delete this item and all of its children?")) return;
    setItems(deleteItem(items, position));
    if (selected === position) setSelected(null);
  }

  function siblingIndex(position: string): { parent: string | null; index: number; count: number } {
    const parent = parentPosition(position);
    const siblings = parent === null ? getRootItems(items) : getChildren(items, parent);
    return { parent, index: siblings.findIndex((s) => s.position === position), count: siblings.length };
  }

  function handleMoveUp(position: string) {
    const { parent, index } = siblingIndex(position);
    setItems(moveItem(items, position, parent, index - 1));
  }
  function handleMoveDown(position: string) {
    const { parent, index } = siblingIndex(position);
    setItems(moveItem(items, position, parent, index + 1));
  }
  function handleIndent(position: string) {
    const { parent, index } = siblingIndex(position);
    const siblings = parent === null ? getRootItems(items) : getChildren(items, parent);
    const previous = siblings[index - 1];
    if (!previous) return;
    const newSiblingCount = getChildren(items, previous.position).length;
    setItems(moveItem(items, position, previous.position, newSiblingCount));
  }
  function handleOutdent(position: string) {
    const parent = parentPosition(position);
    if (parent === null) return;
    const grandparent = parentPosition(parent);
    const { index: parentIndex } = siblingIndex(parent);
    setItems(moveItem(items, position, grandparent, parentIndex + 1));
  }

  async function handleSave(): Promise<CodebookResponse> {
    const body = { name, items };
    if (codebook && codebook.id !== -1) {
      const saved = await updateCodebook.mutateAsync({ id: codebook.id, body });
      onSaved(saved);
      return saved;
    } else {
      const saved = await createCodebook.mutateAsync(body);
      onSaved(saved);
      return saved;
    }
  }

  function handleCloseRequest() {
    if (dirty) {
      setShowUnsavedModal(true);
    } else {
      onCancel();
    }
  }

  const saving = createCodebook.isPending || updateCodebook.isPending;
  const saveError = createCodebook.error ?? updateCodebook.error;

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/80 pb-3">
        <div className="flex items-center gap-3">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={immutable}
            className="h-9 w-64 font-semibold text-sm"
            placeholder="Codebook name"
          />
          {immutable && (
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Immutable (in use) -- read only
            </span>
          )}

          {/* Visual vs YAML toggle */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("visual")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "visual"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              Visual
            </button>
            <button
              type="button"
              onClick={() => setViewMode("yaml")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "yaml"
                  ? "bg-card text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Code2 className="h-3.5 w-3.5" />
              YAML
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleCloseRequest}>
            {dirty ? "Discard changes" : "Close"}
          </Button>
          {!immutable && (
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!dirty || saving || items.length === 0}
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>

      {saveError && <p className="text-sm text-destructive">{saveError.message}</p>}

      {/* Main Content Area */}
      {viewMode === "yaml" ? (
        <div className="flex-1 overflow-hidden">
          <CodebookYamlEditor items={items} onChange={setItems} disabled={immutable} />
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-4 overflow-hidden">
          {/* Left Column: Simplified Tree View */}
          <div className="flex flex-col gap-2 overflow-auto rounded-xl border border-border bg-card p-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Codebook Items ({items.length})
              </span>
              {!immutable && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => addItem(null)}
                >
                  + Add root item
                </Button>
              )}
            </div>

            {items.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No items yet. Add a root item to get started.
              </p>
            )}

            <div className="flex-1 overflow-y-auto">
              <CodebookTreeView
                items={items}
                selected={selected}
                onSelect={setSelected}
                onAddChild={addItem}
                onDelete={handleDelete}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                onIndent={handleIndent}
                onOutdent={handleOutdent}
              />
            </div>
          </div>

          {/* Right Column: Item Editor with Live Preview */}
          <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
            {selectedItem ? (
              <div className="flex h-full flex-col overflow-hidden">
                {/* Item Editor Header */}
                <div className="flex items-center justify-between border-b border-border/80 bg-muted/30 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Item Type
                      </span>
                      <select
                        className="mt-0.5 h-8 rounded-md border border-input bg-background px-2.5 text-xs font-semibold"
                        value={selectedItem.type}
                        disabled={immutable}
                        onChange={(e) =>
                          changeItemType(selectedItem.position, e.target.value as CodebookItem["type"])
                        }
                      >
                        {(hasUnitLoopAncestor(items, selectedItem.position)
                          ? ITEM_TYPE_OPTIONS_IN_LOOP
                          : ITEM_TYPE_OPTIONS_TOP
                        ).map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Toggle between Edit Form and Live Preview */}
                  <div className="flex items-center rounded-lg border border-border bg-card p-0.5">
                    <button
                      type="button"
                      onClick={() => setItemPane("edit")}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        itemPane === "edit"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Edit3 className="h-3 w-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setItemPane("preview")}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                        itemPane === "preview"
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Eye className="h-3 w-3" />
                      Live Preview
                    </button>
                  </div>
                </div>

                {/* Pane Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  {itemPane === "preview" ? (
                    <CodebookPreviewVariable item={selectedItem} parentLoop={parentLoop} />
                  ) : (
                    <fieldset disabled={immutable} className="contents">
                      <ItemForm
                        item={selectedItem}
                        unitsets={unitsetsQuery.data ?? []}
                        unitVariableNames={unitVariableNames}
                        onChange={(next) =>
                          setItems(items.map((i) => (i.position === next.position ? next : i)))
                        }
                      />
                    </fieldset>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Select an item in the tree to edit properties or preview.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Unsaved Changes Confirmation Dialog */}
      <UnsavedChangesDialog
        open={showUnsavedModal}
        isSaving={saving}
        onCancel={() => setShowUnsavedModal(false)}
        onDiscard={() => {
          setShowUnsavedModal(false);
          onCancel();
        }}
        onSave={async () => {
          await handleSave();
          setShowUnsavedModal(false);
          onCancel();
        }}
      />
    </div>
  );
}

/** True if `position` has an ancestor (parent, grandparent, etc.) that is a `unit_loop`. */
function hasUnitLoopAncestor(items: CodebookItem[], position: string): boolean {
  let current: string | null = parentPosition(position);
  while (current !== null) {
    const item = items.find((i) => i.position === current);
    if (item?.type === "unit_loop") return true;
    current = parentPosition(current);
  }
  return false;
}

/** True if `position` itself is a `unit_loop` or has a `unit_loop` ancestor. */
function isOrInsideUnitLoop(items: CodebookItem[], position: string): boolean {
  let current: string | null = position;
  while (current !== null) {
    const item = items.find((i) => i.position === current);
    if (item?.type === "unit_loop") return true;
    current = parentPosition(current);
  }
  return false;
}
