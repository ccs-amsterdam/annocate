import { useState } from "react";
import { isEmail, type CoderResponse } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useCoderMutations } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Sets or clears the email address an expert coder signs in with. Their id stays. */
export function EditEmailDialog({
  client,
  coder,
  onClose,
}: {
  client: ResearcherApi;
  coder: CoderResponse;
  onClose: () => void;
}) {
  const { update } = useCoderMutations(client);
  const [typed, setTyped] = useState(coder.email ?? "");
  const email = typed.trim();
  const invalid = email !== "" && !isEmail(email);
  const save = () =>
    update.mutate({ coder: coder.coder, body: { email: email === "" ? null : email } }, { onSuccess: onClose });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Email address of {coder.coder}</DialogTitle>
          <DialogDescription>
            What this coder signs in with, where the study has coders sign in. Leave it empty for none. A session that
            started keeps the address it started with; the coder id never changes.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!invalid) save();
          }}
        >
          <Input
            type="email"
            aria-label={`Email address of ${coder.coder}`}
            value={typed}
            placeholder="name@example.org"
            onChange={(e) => setTyped(e.target.value)}
          />
          {invalid && <p className="text-xs text-destructive">Not an email address.</p>}
          {update.isError && <p className="text-xs text-destructive">{update.error.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={invalid || update.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
