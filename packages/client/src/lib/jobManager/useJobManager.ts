import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { JobServer } from "../api/httpJobServer";
import { JobManager, type JobManagerSnapshot } from "./JobManager";

/** React binding for `JobManager`, using `useSyncExternalStore` for tear-free snapshots. */
export function useJobManager(jobServer: JobServer): { manager: JobManager; snapshot: JobManagerSnapshot } {
  const manager = useMemo(() => new JobManager(jobServer), [jobServer]);

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
