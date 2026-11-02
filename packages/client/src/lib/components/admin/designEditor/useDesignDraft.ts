import { useEffect, useMemo, useState } from "react";
import {
  undeclaredFields,
  designItems,
  splitSession,
  DesignConflictSchema,
  validateDesignItems,
  type DesignConflict,
  type DesignIssue,
  type DesignItem,
  type DesignVersion,
  type TopLevelItem,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCreateDesignVersionMutation, useUnitFieldsQuery, useUpdateDesignVersionMutation } from "../../../admin/queries";
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
} from "../../../design/itemEdit";
import { findItem } from "../../../codebook/tree";
import { pathOfItem, unknownUnitFields } from "../../../design/unitFieldRefs";
import { carryKeys } from "../../../design/itemShape";
import { changedKeys, emptyHistory, recordChange, redo, revertItem, undo } from "../../../design/editHistory";
import { ResearcherApiError } from "../../../api/httpResearcherApi";
import { clearBackup, writeBackup, type DesignBackup } from "../../../design/localBackup";

/** Unsaved edits are copied to the browser's storage this long after the last change. */
const BACKUP_DELAY_MS = 1000;
import { defaultItemForType } from "../ItemForm";
import type { ItemType } from "../designTree/utils";

interface UseDesignDraftOptions {
  client: ResearcherApi;
  /** The version being edited; null/undefined for a new design version. */
  version?: DesignVersion | null;
  readOnly: boolean;
  onSaved: (version: DesignVersion) => void;
  /** Unsaved edits of this version from an earlier session (localBackup.ts), to continue with. */
  restore?: DesignBackup | null;
}

/**
 * The editor's in-memory copy of a design version: its items (with
 * client-side `_key`s), the selected item, validation, unsaved-change
 * tracking (per item, with revert), undo/redo, and saving (with a check
 * that nobody else saved meanwhile).
 *
 * State is initialised from `version` once: mount the editor with a `key`
 * per version (DesignManager does) to start over for another version.
 */
export function useDesignDraft({ client, version, readOnly, onSaved, restore }: UseDesignDraftOptions) {
  const [items, setItemsState] = useState<TopLevelItem[]>(() =>
    // The session is edited as the first item (contracts designItems), stored next to the items
    restore ? ensureKeys(restore.items) : ensureKeys(version ? (designItems(version) as TopLevelItem[]) : []),
  );
  const [selected, setSelected] = useState<string | null>(null);
  // The items as last saved (with the same keys), to tell what changed and to revert to
  const [saved, setSaved] = useState<TopLevelItem[]>(() => (restore ? ensureKeys(restore.saved) : items));
  // The saved revision the edits are based on (contracts DesignWriteSchema `revision`)
  const [revision, setRevision] = useState<number | undefined>(restore ? restore.revision : version?.revision);
  const [history, setHistory] = useState(() => emptyHistory<TopLevelItem[]>());
  const [conflict, setConflict] = useState<DesignConflict | null>(null);

  const createDesignVersion = useCreateDesignVersionMutation(client);
  const updateDesignVersion = useUpdateDesignVersionMutation(client);

  const cleanItems = useMemo(() => stripKeys(items), [items]);
  const serialized = useMemo(() => JSON.stringify(cleanItems), [cleanItems]);
  const savedSerialized = useMemo(() => JSON.stringify(stripKeys(saved)), [saved]);
  // Errors and warnings. Drafts can be saved with errors; deploying needs none.
  // Plus the unit fields it uses that the design doesn't declare (docs/plans/design.md §3): the open
  // version's fields, as the server checks them at deploy (a new design gets the job's current fields)
  const jobFields = useUnitFieldsQuery(client).data;
  const declared = version ? version.units.fields : jobFields;
  const undeclared = useMemo(() => (declared ? undeclaredFields(cleanItems, declared) : []), [cleanItems, declared]);
  const validationIssues = useMemo(() => {
    const issues: DesignIssue[] = validateDesignItems(cleanItems);
    if (undeclared.length === 0) return issues;
    // At the items that use them, where they can be found; the rest (e.g. answer columns) in one issue
    const located = new Set<string>();
    for (const use of unknownUnitFields(cleanItems as TopLevelItem[], declared ?? [], true)) {
      if (!undeclared.includes(use.field)) continue;
      located.add(use.field);
      const message = `${use.item}: the design doesn't declare the unit field '${use.field}'. Upload units with it, or declare it on the Units page.`;
      issues.push({ path: pathOfItem(cleanItems as TopLevelItem[], use.item) ?? [], message });
    }
    const rest = undeclared.filter((f) => !located.has(f));
    if (rest.length > 0) {
      issues.push({ path: [], message: `Uses unit fields the design doesn't declare: ${rest.join(", ")}. Upload units with them, or declare them on the Units page.` });
    }
    return issues;
  }, [cleanItems, declared, undeclared]);
  const validationErrors = useMemo(() => validationIssues.filter((i) => !i.warning), [validationIssues]);
  const dirty = serialized !== savedSerialized;
  const valid = items.length > 0 && validationErrors.length === 0;
  const canSave = !readOnly && dirty;
  const changed = useMemo(() => changedKeys(items, saved), [items, saved]);
  const selectedItem = selected ? findItem(items, selected) : null;

  useWarnBeforeUnload(dirty);

  // A copy of unsaved edits in the browser, in case it closes (localBackup.ts)
  const backupOf = useMemo(() => ({ jobId: client.jobId ?? 0, designVersionId: version?.id ?? null }), [client.jobId, version?.id]);
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

  /** Items (topmost selected, in design order) moved to a position. */
  function move(keys: string[], position: TreePosition) {
    setItems(moveAllTo(items, keys, position));
  }

  function update(key: string, next: DesignItem) {
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
  async function save({ overwrite = false }: { overwrite?: boolean } = {}): Promise<DesignVersion> {
    if (readOnly) throw new Error("This version is read only");
    const sent = items;
    try {
      // A frozen (live) version is never overwritten: its changes become a new draft
      const result =
        version && !version.immutable
          ? await updateDesignVersion.mutateAsync({
              id: version.id,
              body: { note: version.note ?? undefined, ...splitSession(cleanItems), revision: overwrite ? undefined : revision },
            })
          : await createDesignVersion.mutateAsync(splitSession(cleanItems));
      setSaved(sent);
      setRevision(result.revision);
      clearBackup(backupOf);
      setConflict(null);
      onSaved(result);
      return result;
    } catch (err) {
      if (err instanceof ResearcherApiError && err.code === "design_conflict") {
        setConflict(DesignConflictSchema.parse(err.body));
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
    /** Unit fields the design uses but doesn't declare (errors, at the items that use them). */
    undeclared,
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
    saving: createDesignVersion.isPending || updateDesignVersion.isPending,
    saveError: conflict ? null : (createDesignVersion.error ?? updateDesignVersion.error),
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

export type DesignDraft = ReturnType<typeof useDesignDraft>;

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
