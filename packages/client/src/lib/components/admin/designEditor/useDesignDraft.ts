import { useEffect, useMemo, useRef, useState } from "react";
import {
  undeclaredFields,
  validateDesignItems,
  type CoderKind,
  type DesignIssue,
  type DesignItem,
  type StudyEnd,
  type DesignVersion,
  type DesignVersionMeta,
  type TopLevelItem,
} from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import {
  useCreateDesignVersionMutation,
  useUnitFieldsQuery,
  useUpdateDesignVersionMutation,
} from "../../../admin/queries";
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
import { ELSE, findItem } from "../../../codebook/tree";
import { pathOfItem, unknownUnitFields } from "../../../design/unitFieldRefs";
import { carryKeys } from "../../../design/itemShape";
import { changedKeys, revertItem } from "../../../design/editHistory";
import { backupKeeper, type DesignBackup } from "../../../design/localBackup";
import {
  conflictOf,
  isDirty,
  openDraft,
  saveRequest,
  startDraft,
  withConflict,
  withEdit,
  withRedo,
  withSaved,
  withUndo,
} from "../../../design/draft";

import { defaultItemForType } from "../../../design/newItem";
import { deletedLoopWarning, newLoopId, rememberLoopIds } from "../../../design/loops";
import { withOptional } from "../../../design/itemSettings";
import type { ItemType } from "../designTree/utils";

/** Unsaved edits are copied to the browser's storage this long after the last change. */
const BACKUP_DELAY_MS = 1000;

interface UseDesignDraftOptions {
  client: ResearcherApi;
  /** The kind of coders the study's first deploy fixed (null before it): the invitation must be for it. */
  coderKind: CoderKind | null;
  /** The version being edited; null/undefined for a new design version. */
  version?: DesignVersion | null;
  readOnly: boolean;
  onSaved: (version: DesignVersion) => void;
  /** Unsaved edits from an earlier session (localBackup.ts), to continue with on this version. */
  restore?: DesignBackup | null;
  /** A draft someone else made while this version was edited: saving asks before it replaces that one. */
  newerDraft?: DesignVersionMeta | null;
  /** The deployed design's items, if any: its loops' ids aren't given to new loops, also once deleted here. */
  deployedItems?: readonly TopLevelItem[] | null;
  /** Unit loops (by id) coders finished units in, with how many: deleting one asks first. */
  loopProgress?: ReadonlyMap<string, number>;
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
export function useDesignDraft({
  client,
  coderKind,
  version,
  readOnly,
  onSaved,
  restore,
  newerDraft,
  deployedItems,
  loopProgress,
}: UseDesignDraftOptions) {
  // The items, the items as last saved, the revision the edits are based on, undo steps (design/draft.ts)
  const [draft, setDraft] = useState(() => openDraft(startDraft(version, restore)));
  const { items, saved, revision, history, conflict } = draft;
  const [selected, setSelected] = useState<string | null>(null);

  const createDesignVersion = useCreateDesignVersionMutation(client);
  const updateDesignVersion = useUpdateDesignVersionMutation(client);

  const cleanItems = useMemo(() => stripKeys(items), [items]);
  // Errors and warnings; drafts can be saved with errors, deploying needs none. Plus unit fields the
  // design uses but doesn't declare (docs/architecture.md §8.4), against the open version's fields as the
  // server checks them at deploy (a new design: the study's current fields). Also the study's current
  // fields: a set column made while editing (e.g. the coders') is declared on the latest version, and
  // saving takes it along.
  const studyFields = useUnitFieldsQuery(client).data;
  const declared = useMemo(() => {
    if (!version) return studyFields;
    const extra = (studyFields ?? []).filter((f) => !version.units.fields.some((v) => v.name === f.name));
    return [...version.units.fields, ...extra];
  }, [version, studyFields]);
  const undeclared = useMemo(() => (declared ? undeclaredFields(cleanItems, declared) : []), [cleanItems, declared]);
  const validationIssues = useMemo(() => {
    const issues: DesignIssue[] = validateDesignItems(cleanItems, coderKind);
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
      issues.push({
        path: [],
        message: `Uses unit fields the design doesn't declare: ${rest.join(", ")}. Upload units with them, or declare them on the Units page.`,
      });
    }
    return issues;
  }, [cleanItems, coderKind, declared, undeclared]);
  const validationErrors = useMemo(() => validationIssues.filter((i) => !i.warning), [validationIssues]);
  const dirty = useMemo(() => isDirty({ items, saved }), [items, saved]);
  const valid = items.length > 0 && validationErrors.length === 0;
  const canSave = !readOnly && dirty;
  const changed = useMemo(() => changedKeys(items, saved), [items, saved]);
  const selectedItem = selected ? findItem(items, selected) : null;

  useWarnBeforeUnload(dirty);

  // A copy of unsaved edits in the browser, in case it closes (localBackup.ts). Without edits this
  // editor's own backup goes; one of an earlier session that is still on offer stays.
  const studyId = client.studyId ?? 0;
  const designVersionId = version?.id ?? null;
  const [backup] = useState(() => backupKeeper(studyId, Boolean(restore)));
  useEffect(() => {
    if (readOnly) return;
    if (!dirty) {
      backup.clear();
      return;
    }
    const timer = setTimeout(
      () => backup.write({ studyId, designVersionId, revision, items, saved, at: Date.now() }),
      BACKUP_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [readOnly, dirty, backup, studyId, designVersionId, revision, items, saved]);

  /** Every edit goes through here: it becomes an undo step (see editHistory.ts). */
  function setItems(next: TopLevelItem[]) {
    if (readOnly) return;
    setDraft((d) => withEdit(d, next, Date.now()));
  }

  /** One item back as it was last saved (removed, if it is new). */
  function revert(key: string) {
    setItems(revertItem(items, saved, key));
  }

  /** Every unsaved change undone (itself an undo step). */
  function revertAll() {
    setItems(saved);
  }

  // Loop ids this editor has seen (also of loops deleted since): a new loop never gets one of them
  const seenLoopIds = useRef(new Set<string>());

  function createItem(type: ItemType) {
    const name = getUniqueItemName(items, type);
    // A new loop's id: the next one not used in this design as far as the editor knows it
    const loopId =
      type === "unit_loop" ? newLoopId(seenLoopIds.current, [items, saved, deployedItems ?? []]) : undefined;
    return { ...defaultItemForType(type, name, loopId), _key: generateKey() };
  }

  function insertAt(position: TreePosition, type: ItemType) {
    const item = createItem(type);
    setItems(ensureKeys(insertAtPosition(items, position, item)));
    setSelected(item._key);
  }

  /** A branch's else items begin: its else part (codebook/tree.ts `ELSE`) with a first item of `type`, selected. */
  function addElse(branchKey: string, type: ItemType) {
    const first = createItem(type);
    const stand = { type: ELSE, _key: generateKey(), children: [first] } as unknown as DesignItem;
    setItems(ensureKeys(insertAtPosition(items, { into: branchKey }, stand)));
    setSelected(first._key);
  }

  /** Items (and what is inside them) deleted, after asking. */
  function remove(requested: string[]): boolean {
    // The Study entry stays
    const keys = requested.filter((key) => findItem(items, key)?.type !== "session");
    if (keys.length === 0) return false;
    const what = keys.length === 1 ? "this item" : `these ${keys.length} items`;
    const next = deleteItems(items, keys);
    const warning = deletedLoopWarning(items, next, loopProgress);
    if (!confirm(`Delete ${what} and everything inside?${warning ? `\n\n${warning}` : ""}`)) return false;
    rememberLoopIds(seenLoopIds.current, [items]);
    setItems(next);
    if (selected !== null && !findItem(next, selected)) setSelected(null);
    return true;
  }

  /** Items (topmost selected, in design order) moved to a position. */
  function move(keys: string[], position: TreePosition) {
    // The Study entry stays first
    setItems(
      moveAllTo(
        items,
        keys.filter((key) => findItem(items, key)?.type !== "session"),
        position,
      ),
    );
  }

  /** The study's normal end (the Study entry's `end`); undefined: none. */
  function setStudyEnd(end: StudyEnd | undefined) {
    setItems(items.map((i) => (i.type === "session" ? withOptional(i, "end", end) : i)));
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
   * revision than the server has is refused (someone else saved), and so is
   * one that would pass by a draft someone else made meanwhile: then
   * `conflict` is set, and `save({ overwrite: true })` saves anyway.
   */
  async function save({ overwrite = false }: { overwrite?: boolean } = {}): Promise<DesignVersion> {
    if (readOnly) throw new Error("This version is read only");
    const sent = items;
    const request = saveRequest({ items: cleanItems, version, revision, newerDraft, overwrite });
    if ("conflict" in request) {
      setDraft((d) => withConflict(d, request.conflict));
      throw new Error("Someone else saved a draft meanwhile");
    }
    try {
      const result =
        "create" in request
          ? await createDesignVersion.mutateAsync(request.create)
          : await updateDesignVersion.mutateAsync({ id: request.update, body: request.body });
      setDraft((d) => withSaved(d, sent, result));
      backup.clear();
      onSaved(result);
      return result;
    } catch (err) {
      const refused = conflictOf(err);
      if (!refused) throw err;
      setDraft((d) => withConflict(d, refused));
      throw new Error("Someone else saved this draft meanwhile", { cause: err });
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
    dismissConflict: () => setDraft((d) => withConflict(d, null)),
    saving: createDesignVersion.isPending || updateDesignVersion.isPending,
    saveError: conflict ? null : (createDesignVersion.error ?? updateDesignVersion.error),
    select: setSelected,
    insertAt,
    addElse,
    remove,
    move,
    update,
    setStudyEnd,
    replaceAll,
    undo: () => setDraft(withUndo),
    redo: () => setDraft(withRedo),
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
