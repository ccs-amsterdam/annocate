import { useState } from "react";
import { DoorOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMenuKeys } from "../keyboard/hooks";

type Choice = "pause" | "quit" | "delete";

/** The word a coder types to confirm asking for deletion (so it isn't done by accident). */
const CONFIRM_WORD = "delete";

/**
 * "Stop": the coder's ways out of a study (docs/coder-identity.md §8): stop
 * for now (and how to continue), quit for good, or quit and ask for their
 * answers to be deleted. Deletion is a request the researcher decides on:
 * they may already hold the data, and an automatic deletion could undo paid
 * panel work. Asking takes typing a word, so it doesn't happen by accident.
 */
export function QuitMenu({
  onQuit,
  canTransfer,
  login = null,
  waitingForConnection = false,
}: {
  onQuit: (requestDeletion: boolean) => Promise<void>;
  canTransfer: boolean;
  /** The email the coder is logged in with: they continue anywhere by logging in. */
  login?: string | null;
  /** Saving waits for the connection: quitting waits with it, and the dialog says so. */
  waitingForConnection?: boolean;
}) {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [open, setOpen] = useState(false);
  useMenuKeys(open);
  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-bar-foreground transition-colors hover:bg-bar-foreground/15"
            title="Stop"
            aria-label="Stop"
          >
            <DoorOpen className="h-4 w-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-1.5 shadow-lg">
          <MenuItem
            title="Stop for now"
            detail="Continue later where you left off."
            onClick={() => setChoice("pause")}
          />
          <MenuItem
            title="Quit this study"
            detail="Stop for good. Your answers so far are kept."
            onClick={() => setChoice("quit")}
          />
          <MenuItem
            title="Quit and ask to delete my answers"
            detail="Stop for good, and ask the researchers to delete your answers."
            onClick={() => setChoice("delete")}
          />
        </PopoverContent>
      </Popover>
      <QuitDialog
        choice={choice}
        canTransfer={canTransfer}
        login={login}
        waitingForConnection={waitingForConnection}
        onClose={() => setChoice(null)}
        onQuit={onQuit}
      />
    </>
  );
}

function MenuItem({ title, detail, onClick }: { title: string; detail: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer flex-col items-start rounded-md px-2.5 py-2 text-left hover:bg-muted"
    >
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}

/** The dialog for each way out; also used on the end screen to ask for deletion after finishing. */
export function QuitDialog({
  choice,
  canTransfer = false,
  login = null,
  waitingForConnection = false,
  onClose,
  onQuit,
}: {
  choice: Choice | null;
  canTransfer?: boolean;
  login?: string | null;
  waitingForConnection?: boolean;
  onClose: () => void;
  onQuit: (requestDeletion: boolean) => Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  useMenuKeys(choice !== null);
  const close = () => {
    setTyped("");
    onClose();
  };
  const run = async (requestDeletion: boolean) => {
    setBusy(true);
    try {
      await onQuit(requestDeletion);
      close();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={choice !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md">
        {choice === "pause" && <PauseBody login={login} canTransfer={canTransfer} onClose={close} />}
        {choice === "quit" && (
          <QuitBody busy={busy} waiting={waitingForConnection} onCancel={close} onQuit={() => void run(false)} />
        )}
        {choice === "delete" && (
          <DeleteBody
            typed={typed}
            onType={setTyped}
            busy={busy}
            waiting={waitingForConnection}
            onCancel={close}
            onQuit={() => void run(true)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Stop for now: how to continue later. */
function PauseBody({
  login,
  canTransfer,
  onClose,
}: {
  login: string | null;
  canTransfer: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Stop for now</DialogTitle>
        <DialogDescription>Your answers are saved as you go. You can simply close this page.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2 text-sm text-foreground">
        {login ? (
          <p>
            To continue later, open the same link again: on this device, or on another one by logging in as{" "}
            <strong>{login}</strong>. You continue where you left off.
          </p>
        ) : (
          <p>
            To continue later, open the same link again <strong>on this device, in this browser</strong>: you continue
            where you left off. Your session is kept in this browser, so it is lost if you clear its cookies or use a
            private window.
          </p>
        )}
        {canTransfer && (
          <p>
            To continue on another device, use <strong>Continue on another device</strong> (the screen icon at the top)
            before you stop.
          </p>
        )}
      </div>
      <DialogFooter>
        <Button onClick={onClose}>OK</Button>
      </DialogFooter>
    </>
  );
}

interface ConfirmProps {
  /** Quitting is being sent. */
  busy: boolean;
  /** Saving waits for the connection, and quitting with it. */
  waiting: boolean;
  onCancel: () => void;
  onQuit: () => void;
}

/** Why the Quit button does nothing yet: everything is saved before the session ends. */
function ConnectionWait() {
  return (
    <p role="status" className="text-sm text-muted-foreground">
      Waiting for the connection… You quit as soon as it is back.
    </p>
  );
}

/** Quit for good: the answers so far are kept. */
function QuitBody({ busy, waiting, onCancel, onQuit }: ConfirmProps) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Quit this study?</DialogTitle>
        <DialogDescription>You won&apos;t be able to continue afterwards.</DialogDescription>
      </DialogHeader>
      <p className="text-sm text-foreground">
        The answers you gave so far are kept, and the researchers can use them. Answers to the item you have open now
        and didn&apos;t finish are not saved.
      </p>
      {waiting && <ConnectionWait />}
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" disabled={busy} onClick={onQuit}>
          Quit
        </Button>
      </DialogFooter>
    </>
  );
}

/** Quit and ask for deletion: confirmed by typing a word. */
function DeleteBody({
  typed,
  onType,
  busy,
  waiting,
  onCancel,
  onQuit,
}: ConfirmProps & { typed: string; onType: (typed: string) => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Ask to delete your answers?</DialogTitle>
        <DialogDescription>This ends your session, and you won&apos;t be able to continue.</DialogDescription>
      </DialogHeader>
      <div className="space-y-2 text-sm text-foreground">
        <p>
          The researchers get a request to delete all your answers to this study. They decide on it: they may already
          have downloaded the answers, or need them under the terms of the study (for instance when you were paid for
          taking part).
        </p>
        <p>
          If you want to follow up on your request, contact the researchers of this study, and tell them when you sent
          it and the link you used.
        </p>
        <label className="flex flex-col gap-1 pt-1 text-xs font-medium">
          Type &ldquo;{CONFIRM_WORD}&rdquo; to confirm
          <Input value={typed} onChange={(e) => onType(e.target.value)} autoComplete="off" />
        </label>
        {waiting && <ConnectionWait />}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="destructive" disabled={busy || typed.trim().toLowerCase() !== CONFIRM_WORD} onClick={onQuit}>
          Quit and ask to delete
        </Button>
      </DialogFooter>
    </>
  );
}
