import { Compass } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { answerGuidePrompt, useGuidePrompt } from "./guideStore";

/**
 * After a researcher's first study: take the guide or not. It has to be
 * answered (no closing it otherwise), so it can't be missed; the guide
 * stays available from the Guide button.
 */
export function GuidePrompt() {
  const open = useGuidePrompt();
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <div className="flex flex-col gap-3">
          <Compass className="h-8 w-8 text-primary" aria-hidden />
          <DialogTitle className="font-heading text-xl">Your first study: take the guide?</DialogTitle>
          <DialogDescription>
            A few minutes through the design, who codes, the units and deploying, shown on a sample study. You can
            open it again any time with the Guide button.
          </DialogDescription>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => answerGuidePrompt(false)}>
              No, thanks
            </Button>
            <Button onClick={() => answerGuidePrompt(true)}>Yes, show me</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
