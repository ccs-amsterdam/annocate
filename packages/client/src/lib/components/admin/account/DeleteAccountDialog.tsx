import { useEffect, useState, type ReactNode } from "react";
import type { AccountDeletion } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  deletionError,
  deletionPlan,
  emailConfirmed,
  type DeletionPlan,
  type Whose,
} from "../../../admin/confirmDeletion";
import { ConfirmDeletionDialog } from "../ConfirmDeletionDialog";

const TITLE: Record<Whose, string> = { own: "Delete your account", user: "Delete this user's account" };

const WHAT_GOES: Record<Whose, string> = {
  own: "This permanently deletes your account: your logins, your roles in studies, your API keys and your security log.",
  user: "This permanently deletes the user's account: their logins, their roles in studies, their API keys and their security log.",
};

const STUDIES_GO: Record<Whose, string> = {
  own: "These studies, in which only you have a role, are deleted with it, with all their units, answers and results:",
  user: "These studies, in which only they have a role, are deleted with it, with all their units, answers and results:",
};

/**
 * Deleting an account (docs/accounts.md), one's own or (a server admin)
 * another user's: asks the server what would go (`load`), then either says
 * what keeps the account, or asks to type its email address and deletes it
 * (`remove`). `onDeleted`: after it is deleted.
 */
export function DeleteAccountDialog({
  whose,
  load,
  remove,
  onDeleted,
  onClose,
}: {
  whose: Whose;
  load: () => Promise<AccountDeletion>;
  remove: (confirm: string) => Promise<void>;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [deletion, setDeletion] = useState<AccountDeletion | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Asked once, when the dialog opens
  useEffect(() => {
    load().then(setDeletion, (e: unknown) => setProblem(deletionError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!deletion)
    return (
      <Notice title={TITLE[whose]} onClose={onClose}>
        {problem ? <p className="text-destructive">{problem}</p> : <p>Loading...</p>}
      </Notice>
    );

  const plan = deletionPlan(deletion, whose);
  if (!plan.allowed)
    return (
      <Notice title={TITLE[whose]} onClose={onClose}>
        <Blockers email={deletion.email} blockers={plan.blockers} />
      </Notice>
    );

  return (
    <ConfirmDeletionDialog
      title={TITLE[whose]}
      expected={deletion.email}
      confirmed={(typed) => emailConfirmed(typed, deletion.email)}
      onDelete={async (confirm) => {
        await remove(confirm);
        onDeleted();
      }}
      onClose={onClose}
    >
      <p>{WHAT_GOES[whose]}</p>
      <StudiesDeleted whose={whose} plan={plan} />
      <p>It can&apos;t be undone.</p>
    </ConfirmDeletionDialog>
  );
}

/** A dialog that only says something (loading, or why the account can't be deleted). */
function Notice({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">{children}</div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Why the account can't be deleted yet, with what to do first. */
function Blockers({ email, blockers }: { email: string; blockers: string[] }) {
  return (
    <>
      <p>
        The account <strong className="text-foreground">{email}</strong> can&apos;t be deleted yet:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        {blockers.map((blocker) => (
          <li key={blocker}>{blocker}</li>
        ))}
      </ul>
    </>
  );
}

/** The studies deleted with the account, if any. */
function StudiesDeleted({ whose, plan }: { whose: Whose; plan: DeletionPlan }) {
  if (plan.studies.length === 0) return <p>No studies are deleted with it.</p>;
  return (
    <>
      <p>{STUDIES_GO[whose]}</p>
      <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-foreground">
        {plan.studies.map((name, i) => (
          <li key={i}>{name}</li>
        ))}
      </ul>
    </>
  );
}
