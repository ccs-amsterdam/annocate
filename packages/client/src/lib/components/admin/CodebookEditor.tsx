import { useState, useEffect, useMemo } from "react";
import {
  validateCodebookItems,
  type CodebookItem,
  type CodebookResponse,
  type TopLevelItem,
  type UnitLoopItem,
} from "@annotinder/contracts";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCreateCodebookMutation, useUpdateCodebookMutation, useUnitsetsQuery } from "../../admin/queries";
import {
  deleteItem,
  ensureKeys,
  generateKey,
  getUniqueItemName,
  insertItem,
  insertItemBefore,
  moveItemTo,
  moveToRootEnd,
  stripKeys,
  type MoveTargetPosition,
  updateItem,
} from "../../codebook/codebookEdit";
import { findItem, findParent, flattenTree, isInsideUnitLoop } from "../../codebook/tree";
import { CodebookTreeView } from "./CodebookTreeView";
import { ItemForm, defaultItemForType } from "./ItemForm";
import { CodebookYamlEditor } from "./CodebookYamlEditor";
import { CodebookPreviewVariable } from "./CodebookPreviewVariable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sliders, Code2, Eye, Edit3, AlertCircle, History, Lock } from "lucide-react";

function getItemAtPath(tree: unknown[], path: (string | number)[]): CodebookItem | null {
  let current: any = tree;
  for (const segment of path) {
    if (segment === "name" || segment === "type" || segment === "children" || segment === "variable") {
      continue;
    }
    if (typeof segment === "number") {
      if (Array.isArray(current)) {
        current = current[segment];
      } else if (current && Array.isArray(current.children)) {
        current = current.children[segment];
      }
    }
  }
  return current ?? null;
}

/**
 * Whole-document codebook editor (design plan §5.2): holds one in-memory
 * draft (`name` + nested `items` array), edited purely client-side via
 * `codebookEdit.ts`, and saved in one `PUT`/`POST /codebook` call.
 */
export function CodebookEditor({
  client,
  codebook,
  onSaved,
  onDirtyChange,
  onOpenVersions,
}: {
  client: AdminClient;
  codebook?: CodebookResponse | null;
  onSaved: (codebook: CodebookResponse) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onOpenVersions?: () => void;
}) {
  const [name, setName] = useState(codebook?.name ?? "Untitled Codebook");
  const [items, setItems] = useState<TopLevelItem[]>(() =>
    codebook?.items ? ensureKeys(codebook.items as TopLevelItem[]) : [],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [itemPane, setItemPane] = useState<"edit" | "preview">("edit");
  const [viewMode, setViewMode] = useState<"tree" | "yaml">("tree");

  // Track pristine baseline for dirty checking
  const [pristineBaseline, setPristineBaseline] = useState<string>(() =>
    JSON.stringify({
      name: codebook?.name ?? "Untitled Codebook",
      items: codebook?.items ? stripKeys(codebook.items as TopLevelItem[]) : [],
    }),
  );

  const immutable = codebook?.immutable ?? false;

  const createCodebook = useCreateCodebookMutation(client);
  const updateCodebook = useUpdateCodebookMutation(client);
  const unitsetsQuery = useUnitsetsQuery(client);

  const selectedItem = selected ? findItem(items, selected) : null;
  const allItems = flattenTree(items);
  const unitVariableNames = allItems
    .filter((i) => i.type === "unit_variable" || (i.type === "question" && isInsideUnitLoop(items, (i as any)._key || i.name)))
    .map((i) => i.name);

  // Derive cleaned items (strip client _key for validation and serialization)
  const cleanItems = useMemo(() => stripKeys(items), [items]);

  // Client-side schema validation via contracts' validateCodebookItems
  const validationIssues = useMemo(() => {
    return validateCodebookItems(cleanItems);
  }, [cleanItems]);

  const selectedItemValidationIssues = useMemo(() => {
    if (!selectedItem) return [];
    return validationIssues.filter((i) => {
      if (selectedItem.name && i.message.includes(`'${selectedItem.name}'`)) return true;
      const targetInTree = getItemAtPath(cleanItems, i.path);
      return targetInTree && targetInTree.name === selectedItem.name;
    });
  }, [selectedItem, validationIssues, cleanItems]);

  // Dirty tracking comparing current state against pristine baseline
  const currentSerialized = useMemo(() => {
    return JSON.stringify({ name, items: cleanItems });
  }, [name, cleanItems]);

  const dirty = currentSerialized !== pristineBaseline;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // When saved or codebook prop changes, update pristine baseline
  useEffect(() => {
    if (codebook) {
      setName(codebook.name);
      setItems(ensureKeys((codebook.items ?? []) as TopLevelItem[]));
      const baseline = JSON.stringify({
        name: codebook.name,
        items: stripKeys((codebook.items ?? []) as TopLevelItem[]),
      });
      setPristineBaseline(baseline);
    }
  }, [codebook?.id, codebook?.created]);

  // Warn on browser tab close / refresh if unsaved
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // Find enclosing unit_loop if selected item is within a loop
  let parentLoop: UnitLoopItem | undefined = undefined;
  if (selectedItem) {
    let p = findParent(items, (selectedItem as any)._key || selectedItem.name);
    while (p) {
      if (p.type === "unit_loop") {
        parentLoop = p as UnitLoopItem;
        break;
      }
      p = findParent(items, (p as any)._key || p.name);
    }
  }

  function createNewItem(type: CodebookItem["type"], inLoop: boolean) {
    const basePrefix = type === "question" ? "question" : type;
    const newName = getUniqueItemName(items, basePrefix);
    const childName = getUniqueItemName(items, `${newName}_q`);
    return {
      ...defaultItemForType(type, newName, inLoop, childName),
      _key: generateKey(),
    };
  }

  function handleInsertBefore(targetIdentifier: string, type: CodebookItem["type"]) {
    const inLoop = isInsideUnitLoop(items, targetIdentifier);
    const nextItem = createNewItem(type, inLoop);
    const next = insertItemBefore(items, targetIdentifier, nextItem);
    setItems(ensureKeys(next));
    setSelected(nextItem._key);
  }

  function handleInsertAtEnd(parentIdentifier: string | null, type: CodebookItem["type"]) {
    const parent = parentIdentifier ? findItem(items, parentIdentifier) : null;
    const inLoop =
      parent !== null &&
      (parent.type === "unit_loop" || isInsideUnitLoop(items, (parent as any)._key || parent.name));
    const nextItem = createNewItem(type, inLoop);
    const next = insertItem(items, parentIdentifier, nextItem);
    setItems(ensureKeys(next));
    setSelected(nextItem._key);
  }

  function handleMoveToRootEnd(source: string) {
    setItems(moveToRootEnd(items, source));
  }

  function handleDelete(identifier: string) {
    if (!confirm("Delete this item and all of its children?")) return;
    setItems(deleteItem(items, identifier));
    if (selected === identifier) setSelected(null);
  }

  function handleMoveItem(source: string, target: string, position: MoveTargetPosition) {
    setItems(moveItemTo(items, source, target, position));
  }

  async function handleSave(): Promise<CodebookResponse> {
    const body = { name, items: cleanItems };
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
            <span className="flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Immutable (in use) -- read only
            </span>
          )}

          {/* Validation issues counter */}
          {validationIssues.length > 0 && (
            <span
              className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive"
              title={validationIssues.map((i) => i.message).join("\n")}
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {validationIssues.length} issue{validationIssues.length === 1 ? "" : "s"}
            </span>
          )}

          {/* Visual vs YAML toggle */}
          <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("tree")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                viewMode === "tree"
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
          {onOpenVersions && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenVersions}
              className="flex items-center gap-1.5"
            >
              <History className="h-3.5 w-3.5" />
              Versions
            </Button>
          )}

          {!immutable && (
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!dirty || saving || items.length === 0 || validationIssues.length > 0}
              title={
                validationIssues.length > 0
                  ? "Fix validation issues before saving"
                  : !dirty
                    ? "No changes to save"
                    : undefined
              }
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
          <CodebookYamlEditor
            items={cleanItems}
            onChange={(next) => setItems(ensureKeys(next))}
            disabled={immutable}
          />
        </div>
      ) : (
        <div className="grid flex-1 grid-cols-2 gap-4 overflow-hidden">
          {/* Left Column: Simplified Tree View */}
          <div className="flex flex-col gap-2 overflow-auto rounded-xl border border-border bg-card p-3 shadow-xs">
            <div className="flex items-center justify-between border-b border-border/60 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Codebook Items ({allItems.length})
              </span>
            </div>

            {items.length === 0 && (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No items yet. Add an item below to get started.
              </p>
            )}

            <div className="flex-1 overflow-y-auto">
              <CodebookTreeView
                items={items}
                selected={selected}
                onSelect={setSelected}
                onInsertBefore={handleInsertBefore}
                onInsertAtEnd={handleInsertAtEnd}
                onDelete={handleDelete}
                onMoveItem={handleMoveItem}
                onMoveToRootEnd={handleMoveToRootEnd}
                validationIssues={validationIssues}
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
                      <span className="mt-0.5 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-semibold capitalize text-foreground shadow-2xs">
                        {selectedItem.type.replace("_", " ")}
                      </span>
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
                        validationIssues={selectedItemValidationIssues}
                        isInsideLoop={isInsideUnitLoop(items, (selectedItem as any)._key || selectedItem.name)}
                        onChange={(next) => {
                          const key = (selectedItem as any)._key || selected;
                          setItems(updateItem(items, key, { ...next, _key: key } as any as CodebookItem));
                        }}
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
    </div>
  );
}
