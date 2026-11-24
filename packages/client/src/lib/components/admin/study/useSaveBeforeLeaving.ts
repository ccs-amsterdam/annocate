import { useRef, useState } from "react";
import { clearBackup } from "../../../design/localBackup";
import type { LeaveGuard } from "../AdminApp";
import type { SaveFn } from "../DesignEditor";

/** Asks before doing something that replaces the editor's unsaved edits; without any, does it at once. */
export type AskFirst = (action: () => void) => void;

/**
 * Unsaved edits in the editor are asked about (save, discard or stay) before
 * they are lost: on leaving it (another page, another study, the browser's
 * back button), and before something opens the editor anew (`askFirst`:
 * continuing with edits from an earlier session, opening another version).
 * The editor reports whether it has unsaved edits (`setDirty`) and how to
 * save them (`registerSave`); `dialog` are the props of the
 * `UnsavedChangesDialog`.
 */
export function useSaveBeforeLeaving(useLeaveGuard: LeaveGuard, studyId: number, onDesignPage: boolean) {
  const [dirty, setDirty] = useState(false);
  const unsaved = dirty && onDesignPage;
  const leave = useLeaveGuard(unsaved);
  const save = useRef<SaveFn | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // What waits for an answer, other than leaving
  const [waiting, setWaiting] = useState<(() => void) | null>(null);

  /** What was asked about goes ahead: the waiting action, or leaving. */
  const proceed = () => {
    setDirty(false);
    setError(null);
    setWaiting(null);
    // After this render: an action that navigates must find the edits gone, or the leave guard asks again
    if (waiting) setTimeout(waiting);
    else leave.proceed();
  };

  async function saveAndProceed() {
    setSaving(true);
    setError(null);
    try {
      await save.current?.();
      proceed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const askFirst: AskFirst = (action) => {
    if (unsaved) setWaiting(() => action);
    else action();
  };

  return {
    setDirty,
    registerSave: (fn: SaveFn | null) => {
      save.current = fn;
    },
    askFirst,
    dialog: {
      open: leave.blocked || waiting !== null,
      isSaving: saving,
      error,
      onCancel: () => {
        if (waiting) setWaiting(null);
        else leave.stay();
        setError(null);
      },
      onDiscard: () => {
        clearBackup(studyId);
        proceed();
      },
      onSave: saveAndProceed,
    },
  };
}
