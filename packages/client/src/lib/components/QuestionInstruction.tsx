import { COMMAND_BADGES, isHelp } from "../keyboard/commands";
import { useEffect, useState } from "react";
import { HelpCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TemplateMarkdown } from "./TemplateMarkdown";
import { ShortcutBadge } from "./ShortcutBadge";
import { PRIORITY } from "../keyboard/controller";
import { useKeyScope } from "../keyboard/hooks";
import type { RenderedTemplate } from "../codebook/renderTemplate";

// A question's instruction (docs/client.md §4 "Questions and instructions"):
// how to apply the question to units, looked up while coding. A ? button by
// the question (and the ? key) opens it in a dialog; until the coder opened
// it once, a dot on the button points it out. It can also open by itself
// (`instructionOpen`: the first time, or on practice units).

/** The instructions this browser opened, per study page and question: no dot after that. */
const seenKey = (name: string) => `annotinder:instruction-seen:${window.location.pathname}:${name}`;
function wasSeen(name: string): boolean {
  try {
    return localStorage.getItem(seenKey(name)) === "1";
  } catch {
    return false;
  }
}
function markSeen(name: string): void {
  try {
    localStorage.setItem(seenKey(name), "1");
  } catch {
    // Not remembered: the dot shows again next time
  }
}

export function QuestionInstruction({
  name,
  instruction,
  openNow = false,
}: {
  /** The question's name (what was seen is remembered by it). */
  name: string;
  instruction: RenderedTemplate;
  /** Open by itself now (`instructionOpen`). */
  openNow?: boolean;
}) {
  const [open, setOpenState] = useState(openNow);
  const [seen, setSeen] = useState(() => openNow || wasSeen(name));
  // Opened by itself: seen too
  useEffect(() => {
    if (openNow) markSeen(name);
  }, [openNow, name]);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (next && !seen) {
      markSeen(name);
      setSeen(true);
    }
  };
  // Ctrl + Space opens it; while open, keys don't reach the question behind it (Esc closes)
  useKeyScope(
    (press) => {
      if (!isHelp(press)) return false;
      setOpen(true);
      return true;
    },
    !open,
    { priority: PRIORITY.editor },
  );
  useKeyScope(() => false, open, { priority: PRIORITY.menu, exclusive: true });
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Instruction (Ctrl + Space)"
        aria-label={seen ? "Instruction" : "Instruction, not read yet"}
        aria-keyshortcuts="Control+Space"
        className="relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <HelpCircle className="size-5" />
        {!seen && (
          <span
            className="absolute top-0.5 right-0.5 size-2 animate-pulse rounded-full bg-primary"
            aria-label="Not read yet"
          />
        )}
        <ShortcutBadge shortcut={COMMAND_BADGES.help} position="top-left" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Instruction</DialogTitle>
          </DialogHeader>
          <div className="template-markdown flex flex-col gap-2 text-sm text-foreground">
            <TemplateMarkdown rendered={instruction} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
