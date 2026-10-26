import { useEffect, useMemo, useState } from "react";
import {
  validateCodebookItems,
  type CodebookItem,
  type CodebookResponse,
  type TopLevelItem,
} from "@annotinder/contracts";
import type { AdminClient } from "../../../api/httpAdminClient";
import { useCreateCodebookMutation, useUpdateCodebookMutation } from "../../../admin/queries";
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
  updateItem,
  type MoveTargetPosition,
} from "../../../codebook/codebookEdit";
import { findItem } from "../../../codebook/tree";
import { defaultItemForType } from "../ItemForm";
import type { ItemType } from "../codebookTree/utils";

interface UseCodebookDraftOptions {
  client: AdminClient;
  /** The version being edited; null/undefined for a new codebook. */
  codebook?: CodebookResponse | null;
  readOnly: boolean;
  onSaved: (codebook: CodebookResponse) => void;
}

/**
 * The editor's in-memory copy of a codebook version: its items (with
 * client-side `_key`s), the selected item, validation, unsaved-change
 * tracking and saving.
 *
 * State is initialised from `codebook` once: mount the editor with a `key`
 * per version (CodebookManager does) to start over for another version.
 */
export function useCodebookDraft({ client, codebook, readOnly, onSaved }: UseCodebookDraftOptions) {
  const [items, setItems] = useState<TopLevelItem[]>(() => ensureKeys((codebook?.items ?? []) as TopLevelItem[]));
  const [selected, setSelected] = useState<string | null>(null);
  // The items as last saved (serialized), to tell whether there are unsaved changes
  const [savedSerialized, setSavedSerialized] = useState(() =>
    JSON.stringify(stripKeys((codebook?.items ?? []) as TopLevelItem[])),
  );

  const createCodebook = useCreateCodebookMutation(client);
  const updateCodebook = useUpdateCodebookMutation(client);

  const cleanItems = useMemo(() => stripKeys(items), [items]);
  const serialized = useMemo(() => JSON.stringify(cleanItems), [cleanItems]);
  // Errors and warnings; only errors block saving (warnings show next to the item).
  const validationIssues = useMemo(() => validateCodebookItems(cleanItems), [cleanItems]);
  const validationErrors = useMemo(() => validationIssues.filter((i) => !i.warning), [validationIssues]);
  const dirty = serialized !== savedSerialized;
  const canSave = !readOnly && items.length > 0 && validationErrors.length === 0;
  const selectedItem = selected ? findItem(items, selected) : null;

  useWarnBeforeUnload(dirty);

  function createItem(type: ItemType) {
    const name = getUniqueItemName(items, type);
    const childName = getUniqueItemName(items, `${name}_q`);
    return { ...defaultItemForType(type, name, childName), _key: generateKey() };
  }

  function insertBefore(targetKey: string, type: ItemType) {
    const item = createItem(type);
    setItems(ensureKeys(insertItemBefore(items, targetKey, item)));
    setSelected(item._key);
  }

  function insertAtEnd(parentKey: string | null, type: ItemType) {
    const item = createItem(type);
    setItems(ensureKeys(insertItem(items, parentKey, item)));
    setSelected(item._key);
  }

  function remove(key: string) {
    if (!confirm("Delete this item and all of its children?")) return;
    setItems(deleteItem(items, key));
    if (selected === key) setSelected(null);
  }

  function move(source: string, target: string, position: MoveTargetPosition) {
    setItems(moveItemTo(items, source, target, position));
  }

  function moveToEnd(source: string) {
    setItems(moveToRootEnd(items, source));
  }

  function update(key: string, next: CodebookItem) {
    if (readOnly) return;
    // Keep the client-side key, so the item stays selected
    setItems(updateItem(items, key, Object.assign({}, next, { _key: key })));
  }

  function replaceAll(next: TopLevelItem[]) {
    setItems(ensureKeys(next));
  }

  async function save(): Promise<CodebookResponse> {
    if (readOnly) throw new Error("This version is read only");
    if (!canSave) throw new Error("Fix the codebook's issues before saving");
    const sent = serialized;
    // A frozen (live) version is never overwritten: its changes become a new draft
    const saved =
      codebook && !codebook.immutable
        ? await updateCodebook.mutateAsync({
            id: codebook.id,
            body: { note: codebook.note ?? undefined, items: cleanItems },
          })
        : await createCodebook.mutateAsync({ items: cleanItems });
    setSavedSerialized(sent);
    onSaved(saved);
    return saved;
  }

  return {
    items,
    cleanItems,
    selected,
    selectedItem,
    validationIssues,
    validationErrors,
    dirty,
    canSave,
    saving: createCodebook.isPending || updateCodebook.isPending,
    saveError: createCodebook.error ?? updateCodebook.error,
    select: setSelected,
    insertBefore,
    insertAtEnd,
    remove,
    move,
    moveToEnd,
    update,
    replaceAll,
    save,
  };
}

export type CodebookDraft = ReturnType<typeof useCodebookDraft>;

/** Asks the browser to confirm closing or reloading the tab while there are unsaved changes. */
function useWarnBeforeUnload(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [active]);
}
