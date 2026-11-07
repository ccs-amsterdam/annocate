import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { CoderApi } from "../api/httpCoderApi";
import { StudyManager, type StudyManagerSnapshot } from "./StudyManager";

/** React binding for `StudyManager`, using `useSyncExternalStore` for tear-free snapshots. */
export function useStudyManager(coderApi: CoderApi): { manager: StudyManager; snapshot: StudyManagerSnapshot } {
  const manager = useMemo(() => new StudyManager(coderApi), [coderApi]);

  const snapshot = useSyncExternalStore(
    (onStoreChange) => manager.subscribe(onStoreChange),
    () => manager.getSnapshot(),
    () => manager.getSnapshot(),
  );

  useEffect(() => {
    void manager.start();
  }, [manager]);

  return { manager, snapshot };
}
