import { useEffect, useMemo, useState } from "react";
import {
  CodebookConflictSchema,
  validateCodebookItems,
  type CodebookConflict,
  type CodebookItem,
  type CodebookResponse,
  type TopLevelItem,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCreateCodebookMutation, useUpdateCodebookMutation } from "../../../admin/queries";
import {
  deleteItems,
  ensureKeys,
  generateKey,
  getUniqueItemName,
  insertAt as insertAtPosition,
  moveAllTo,
  stripKeys,
  updateItem,
  type TreePosition,
} from "../../../codebook/codebookEdit";
import { findItem } from "../../../codebook/tree";
import { carryKeys } from "../../../codebook/itemShape";
import { changedKeys, emptyHistory, recordChange, redo, revertItem, undo } from "../../../codebook/editHistory";
import { ResearcherApiError } from "../../../api/httpResearcherApi";
import { clearBackup, writeBackup, type CodebookBackup } from "../../../codebook/localBackup";

/** Unsaved edits are copied to the browser's storage this long after the last change. */
const BACKUP_DELAY_MS = 1000;
import { defaultItemForType } from "../ItemForm";
import type { ItemType } from "../codebookTree/utils";

interface UseCodebookDraftOptions {
  client: ResearcherApi;
  /** The version being edited; null/undefined for a new codebook. */
  codebook?: CodebookResponse | null;
  readOnly: boolean;
  onSaved: (codebook: CodebookResponse) => void;
  /** Unsaved edits of this version from an earlier session (localBackup.ts), to continue with. */
  restore?: CodebookBackup | null;
}

/**
 * The editor's in-memory copy of a codebook version: its items (with
 * client-side `_key`s), the selected item, validation, unsaved-change
 * tracking (per item, with revert), undo/redo, and saving (with a check
 * that nobody else saved meanwhile).
 *
 * State is initialised from `codebook` once: mount the editor with a `key`
 * per version (CodebookManager does) to start over for another version.
 */
export function useCodebookDraft({ client, codebook, readOnly, onSaved, restore }: UseCodebookDraftOptions) {
  const [items, setItemsState] = useState<TopLevelItem[]>(() =>
    restore ? ensureKeys(restore.items) : ensureKeys((codebook?.items ?? []) as TopLevelItem[]),
  );
  const [selected, setSelected] = useState<string | null>(null);
  // The items as last saved (with the same keys), to tell what changed and to revert to
  const [saved, setSaved] = useState<TopLevelItem[]>(() => (restore ? ensureKeys(restore.saved) : items));
  // The saved revision the edits are based on (contracts CodebookWriteSchema `revision`)
  const [revision, setRevision] = useState<number | undefined>(restore ? restore.revision : codebook?.revision);
  const [history, setHistory] = useState(() => emptyHistory<TopLevelItem[]>());
  const [conflict, setConflict] = useState<CodebookConflict | null>(null);

  const createCodebook = useCreateCodebookMutation(client);
  const updateCodebook = useUpdateCodebookMutation(client);

  const cleanItems = useMemo(() => stripKeys(items), [items]);
  const serialized = useMemo(() => JSON.stringify(cleanItems), [cleanItems]);
  const savedSerialized = useMemo(() => JSON.stringify(stripKeys(saved)), [saved]);
  // Errors and warnings. Drafts can be saved with errors; publishing needs none.
  const validationIssues = useMemo(() => validateCodebookItems(cleanItems), [cleanItems]);
  const validationErrors = useMemo(() => validationIssues.filter((i) => !i.warning), [validationIssues]);
  const dirty = serialized !== savedSerialized;
  const valid = items.length > 0 && validationErrors.length === 0;
  const canSave = !readOnly && dirty;
  const changed = useMemo(() => changedKeys(items, saved), [items, saved]);
  const selectedItem = selected ? findItem(items, selected) : null;

  useWarnBeforeUnload(dirty);

  // A copy of unsaved edits in the browser, in case it closes (localBackup.ts)
  const backupOf = useMemo(() => ({ jobId: client.jobId ?? 0, codebookId: codebook?.id ?? null }), [client.jobId, codebook?.id]);
  useEffect(() => {
    if (readOnly) return;
    if (!dirty) {
      clearBackup(backupOf);
      return;
    }
    const timer = setTimeout(() => writeBackup({ ...backupOf, revision, items, saved, at: Date.now() }), BACKUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, [readOnly, dirty, backupOf, revision, items, saved]);

  /** Every edit goes through here: it becomes an undo step (see editHistory.ts). */
  function setItems(next: TopLevelItem[]) {
    if (readOnly) return;
    setHistory((h) => recordChange(h, items, Date.now()));
    setItemsState(next);
  }

  function undoChange() {
    const step = undo(history, items);
    if (!step) return;
    setHistory(step.history);
    setItemsState(step.value);
  }

  function redoChange() {
    const step = redo(history, items);
    if (!step) return;
    setHistory(step.history);
    setItemsState(step.value);
  }

  /** One item back as it was last saved (removed, if it is new). */
  function revert(key: string) {
    setItems(revertItem(items, saved, key));
  }

  /** Every unsaved change undone (itself an undo step). */
  function revertAll() {
    setItems(saved);
  }

  function createItem(type: ItemType) {
    const name = getUniqueItemName(items, type);
    return { ...defaultItemForType(type, name), _key: generateKey() };
  }

  function insertAt(position: TreePosition, type: ItemType) {
    const item = createItem(type);
    // The Session item is always first
    if (type === "session") {
      setItems(ensureKeys([item as TopLevelItem, ...items]));
      setSelected(item._key);
      return;
    }
    setItems(ensureKeys(insertAtPosition(items, position, item)));
    setSelected(item._key);
  }

  /** Items (and what is inside them) deleted, after asking. */
  function remove(keys: string[]): boolean {
    if (keys.length === 0) return false;
    const what = keys.length === 1 ? "this item" : `these ${keys.length} items`;
    if (!confirm(`Delete ${what} and everything inside?`)) return false;
    const next = deleteItems(items, keys);
    setItems(next);
    if (selected !== null && !findItem(next, selected)) setSelected(null);
    return true;
  }

  /** Items (topmost selected, in codebook order) moved to a position. */
  function move(keys: string[], position: TreePosition) {
    setItems(moveAllTo(items, keys, position));
  }

  function update(key: string, next: CodebookItem) {
    // Keep the client-side key, so the item stays selected
    setItems(updateItem(items, key, Object.assign({}, next, { _key: key })));
  }

  /** All items replaced (the JSON view): items keep their keys by name, so they stay the same items. */
  function replaceAll(next: TopLevelItem[]) {
    setItems(ensureKeys(carryKeys(next, items)));
  }

  /**
   * Saves the draft (even with validation errors). A save based on an older
   * revision than the server has is refused (someone else saved): then
   * `conflict` is set, and `save({ overwrite: true })` saves anyway.
   */
  async function save({ overwrite = false }: { overwrite?: boolean } = {}): Promise<CodebookResponse> {
    if (readOnly) throw new Error("This version is read only");
    const sent = items;
    try {
      // A frozen (live) version is never overwritten: its changes become a new draft
      const result =
        codebook && !codebook.immutable
          ? await updateCodebook.mutateAsync({
              id: codebook.id,
              body: { note: codebook.note ?? undefined, items: cleanItems, revision: overwrite ? undefined : revision },
            })
          : await createCodebook.mutateAsync({ items: cleanItems });
      setSaved(sent);
      setRevision(result.revision);
      clearBackup(backupOf);
      setConflict(null);
      onSaved(result);
      return result;
    } catch (err) {
      if (err instanceof ResearcherApiError && err.code === "codebook_conflict") {
        setConflict(CodebookConflictSchema.parse(err.body));
        throw new Error("Someone else saved this draft meanwhile", { cause: err });
      }
      throw err;
    }
  }

  return {
    items,
    cleanItems,
    selected,
    selectedItem,
    validationIssues,
    validationErrors,
    dirty,
    valid,
    canSave,
    /** The items as last saved. */
    savedItems: saved,
    /** Keys of items that are new or changed since the last save. */
    changed,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    conflict,
    dismissConflict: () => setConflict(null),
    saving: createCodebook.isPending || updateCodebook.isPending,
    saveError: conflict ? null : (createCodebook.error ?? updateCodebook.error),
    select: setSelected,
    insertAt,
    remove,
    move,
    update,
    replaceAll,
    undo: undoChange,
    redo: redoChange,
    revert,
    revertAll,
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
