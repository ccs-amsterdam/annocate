import { type UnitField } from "@annotinder/contracts";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { useUnitQuery } from "../../../admin/queries";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { unitFieldText } from "../../../admin/unitsTable";

/** One unit with all its fields in full. */
export function UnitDialog({
  client,
  id,
  fields,
  onClose,
}: {
  client: ResearcherApi;
  id: number | null;
  fields: UnitField[];
  onClose: () => void;
}) {
  const unit = useUnitQuery(client, id).data;
  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono">{unit?.externalId ?? "…"}</DialogTitle>
          <DialogDescription>
            {unit?.coded
              ? "Coded: replace it by uploading it again; coders' answers keep the version they saw."
              : "Not coded yet."}
          </DialogDescription>
        </DialogHeader>
        {unit && (
          <dl className="flex flex-col gap-3 text-sm">
            {fields.map((f) => (
              <div key={f.name}>
                <dt className="font-mono text-xs text-muted-foreground">
                  {f.name} <span className="opacity-70">({f.type})</span>
                </dt>
                <dd className="break-words whitespace-pre-wrap">{unitFieldText(unit.data[f.name]) || "–"}</dd>
              </div>
            ))}
          </dl>
        )}
      </DialogContent>
    </Dialog>
  );
}
