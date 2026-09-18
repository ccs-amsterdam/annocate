import { useState } from "react";
import type { CodebookItem, CodebookResponse } from "@annotinder/contracts";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCreateCodebookMutation, useUpdateCodebookMutation, useUnitsetsQuery } from "../../admin/queries";
import { deleteItem, insertItem, moveItem, type NewCodebookItem } from "../../codebook/codebookEdit";
import { parentPosition } from "@annotinder/contracts";
import { getChildren, getRootItems } from "../../codebook/tree";
import { CodebookTreeView } from "./CodebookTreeView";
import { ItemForm, ITEM_TYPE_OPTIONS_IN_LOOP, ITEM_TYPE_OPTIONS_TOP, defaultItemForType } from "./ItemForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Whole-document codebook editor (design plan §5.2): holds one in-memory
 * draft (`name` + flat `items` array), edited purely client-side via
 * `codebookEdit.ts`'s pure position-rewriting functions, and saved in one
 * `PUT`/`POST /codebook` call -- no more per-node mutations/cache-patching
 * like the old app (see the phase-5 research summary in the design plan).
 */
export function CodebookEditor({
  client,
  codebook,
  onSaved,
  onCancel,
}: {
  client: AdminClient;
  /** Existing codebook to edit, or null to create a new one. */
  codebook: CodebookResponse | null;
  onSaved: (codebook: CodebookResponse) => void;
  onCancel: () => void;
}) {
  const unitsetsQuery = useUnitsetsQuery(client);
  const createCodebook = useCreateCodebookMutation(client);
  const updateCodebook = useUpdateCodebookMutation(client);

  const [name, setName] = useState(codebook?.name ?? "New codebook");
  const [items, setItems] = useState<CodebookItem[]>(codebook?.items ?? []);
  const [selected, setSelected] = useState<string | null>(null);

  // No resync-on-`codebook`-change effect needed: `CodebookManager` keys
  // this component by the codebook's identity (id, or "new"/"duplicate"),
  // so a fresh instance -- with fresh `useState` initial values above --
  // mounts whenever a different codebook is opened for editing (design
  // plan §6.5, avoids the react-hooks/set-state-in-effect anti-pattern).

  const dirty = name !== (codebook?.name ?? "New codebook") || items !== (codebook?.items ?? []);
  const immutable = codebook?.immutable ?? false;
  const selectedItem = items.find((i) => i.position === selected) ?? null;
  const unitVariableNames = items.filter((i) => i.type === "unit_variable").map((i) => i.name);

  function addItem(parent: string | null) {
    const inLoop = parent !== null && isInsideUnitLoop(items, parent);
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

  async function handleSave() {
    const body = { name, items };
    // `codebook.id === -1` is the "duplicate as new" sentinel (see
    // CodebookManager's "Duplicate" action): the draft is pre-filled from
    // an existing codebook's content, but must still be CREATED as a
    // brand-new codebook, not updated in place.
    if (codebook && codebook.id !== -1) {
      const saved = await updateCodebook.mutateAsync({ id: codebook.id, body });
      onSaved(saved);
    } else {
      const saved = await createCodebook.mutateAsync(body);
      onSaved(saved);
    }
  }

  const saving = createCodebook.isPending || updateCodebook.isPending;
  const saveError = createCodebook.error ?? updateCodebook.error;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-3">
        <Input value={name} onChange={(e) => setName(e.target.value)} disabled={immutable} className="max-w-sm" />
        {immutable && <span className="text-xs text-muted-foreground">Immutable (in use) -- read only</span>}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {dirty ? "Discard changes" : "Close"}
          </Button>
          {!immutable && (
            <Button type="button" onClick={handleSave} disabled={!dirty || saving || items.length === 0}>
              {saving ? "Saving..." : "Save"}
            </Button>
          )}
        </div>
      </div>
      {saveError && <p className="text-sm text-destructive">{saveError.message}</p>}

      <div className="grid flex-1 grid-cols-2 gap-4 overflow-hidden">
        <div className="flex flex-col gap-2 overflow-auto rounded border p-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">No items yet.</p>}
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
          {!immutable && (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => addItem(null)}>
              + Add root item
            </Button>
          )}
        </div>

        <div className="overflow-auto rounded border p-3">
          {selectedItem ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium">Item type</label>
                <select
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedItem.type}
                  disabled={immutable}
                  onChange={(e) => changeItemType(selectedItem.position, e.target.value as CodebookItem["type"])}
                >
                  {(isInsideUnitLoop(items, selectedItem.position) ? ITEM_TYPE_OPTIONS_IN_LOOP : ITEM_TYPE_OPTIONS_TOP).map(
                    (t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <fieldset disabled={immutable} className="contents">
                <ItemForm
                  item={selectedItem}
                  unitsets={unitsetsQuery.data ?? []}
                  unitVariableNames={unitVariableNames}
                  onChange={(next) => setItems(items.map((i) => (i.position === next.position ? next : i)))}
                />
              </fieldset>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Select an item to edit it.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** True if `position` is at/below a `unit_loop` item -- determines which item types may be added there. */
function isInsideUnitLoop(items: CodebookItem[], position: string): boolean {
  let current: string | null = position;
  while (current !== null) {
    const item = items.find((i) => i.position === current);
    if (item?.type === "unit_loop") return true;
    current = parentPosition(current);
  }
  return false;
}
