import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { CoderApi } from "../api/httpCoderApi";
import { JobManager, type JobManagerSnapshot } from "./JobManager";

/** React binding for `JobManager`, using `useSyncExternalStore` for tear-free snapshots. */
export function useJobManager(coderApi: CoderApi): { manager: JobManager; snapshot: JobManagerSnapshot } {
  const manager = useMemo(() => new JobManager(coderApi), [coderApi]);

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
