import { lazy, Suspense } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { closeHelp, useHelpTarget } from "./helpStore";

const HelpContent = lazy(() => import("./HelpContent"));

/**
 * The help: tutorials and explanations for researchers, one markdown file
 * per topic (`./topics`). Mounted once (AdminApp); opened with `openHelp`
 * or a `HelpButton`. Its content loads with the first opening.
 */
export function HelpDialog() {
  const target = useHelpTarget();
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && closeHelp()}>
      <DialogContent
        aria-describedby={undefined}
        className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-7xl flex-col gap-0 overflow-hidden p-0 sm:max-w-7xl"
      >
        <DialogTitle className="sr-only">Help</DialogTitle>
        <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading help…</p>}>{target && <HelpContent target={target} />}</Suspense>
      </DialogContent>
    </Dialog>
  );
}
