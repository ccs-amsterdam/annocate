import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AddCodersForm } from "./AddCodersForm";

/** "Add coders": makes expert coders from a pasted list. */
export function AddCodersDialog({
  client,
  existing,
  onClose,
}: {
  client: ResearcherApi;
  existing: readonly { coder: string; email: string | null }[];
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add coders</DialogTitle>
          <DialogDescription>
            Expert coders, each with their own units. Give them units afterwards with &quot;Make coder set&quot;. An
            email address is needed only where coders sign in; you can add or change it later.
          </DialogDescription>
        </DialogHeader>
        <AddCodersForm client={client} existing={existing} onAdded={onClose} />
      </DialogContent>
    </Dialog>
  );
}
