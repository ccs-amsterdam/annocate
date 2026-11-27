import { useEffect } from "react";

/** What counts as the user at work: typing, clicking, scrolling, touching. Not the pointer just moving. */
const ACTIVITY_EVENTS = ["keydown", "pointerdown", "wheel", "touchstart"] as const;

/** At most this often (the server's idle time is at least 10 minutes, config.ts). */
export const REPORT_EVERY_MS = 5 * 60_000;

/**
 * While `enabled`, tells the server the user is at work (`report`): when
 * the page opens, and on their input at most every 5 minutes. A login
 * session ends after a while without activity (docs/security.md "The
 * session"), and someone writing in the editor makes no requests.
 */
export function useReportActivity(report: () => Promise<unknown>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let last = -Infinity;
    const onActivity = () => {
      if (Date.now() - last < REPORT_EVERY_MS) return;
      last = Date.now();
      // A failed report changes nothing here (an ended session is the API client's to report)
      report().catch(() => {});
    };
    onActivity();
    const options = { capture: true, passive: true };
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, options);
    return () => {
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity, options);
    };
  }, [report, enabled]);
}
