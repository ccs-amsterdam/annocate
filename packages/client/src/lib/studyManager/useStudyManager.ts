import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { CoderApi } from "../api/httpCoderApi";
import { StudyManager } from "./StudyManager";
import type { StudyManagerSnapshot } from "./types";

/** React binding for `StudyManager`, using `useSyncExternalStore` for tear-free snapshots. */
export function useStudyManager(coderApi: CoderApi): { manager: StudyManager; snapshot: StudyManagerSnapshot } {
  const manager = useMemo(() => new StudyManager(coderApi), [coderApi]);

  const snapshot = useSyncExternalStore(
    (onStoreChange) => manager.subscribe(onStoreChange),
    () => manager.getSnapshot(),
    () => manager.getSnapshot(),
  );

  // (StrictMode runs this twice: `start()` after `dispose()` goes on with the same session)
  useEffect(() => {
    void manager.start();
    return () => manager.dispose();
  }, [manager]);

  return { manager, snapshot };
}
