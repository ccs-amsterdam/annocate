import { useRef, useState } from "react";
import type { AdminClient } from "../../api/httpAdminClient";
import { useCreateUnitsMutation, useDeleteUnitMutation, useUnitsQuery } from "../../admin/queries";
import { parseCsv, csvRowsToUnits } from "../../admin/csv";
import { Button } from "@/components/ui/button";

/**
 * Units upload/management panel (design plan §5.4). Simplified vs. the old
 * app's CSV-only wizard: units are immutable once used, so there's no
 * "overwrite existing" as a default choice -- it's an explicit opt-in, and
 * deletion is only ever offered for units the server confirms are still
 * mutable (unused).
 */
export function UnitsManager({ client }: { client: AdminClient }) {
  const unitsQuery = useUnitsQuery(client);
  const createUnits = useCreateUnitsMutation(client);
  const deleteUnit = useDeleteUnitMutation(client);

  const [csvPreview, setCsvPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [idColumn, setIdColumn] = useState("");
  const [overwrite, setOverwrite] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseCsv(text);
    setCsvPreview(parsed);
    setIdColumn(parsed.headers.find((h) => /^(id|externalid)$/i.test(h)) ?? parsed.headers[0] ?? "");
  }

  async function handleUpload() {
    if (!csvPreview || !idColumn) return;
    const units = csvRowsToUnits(csvPreview.headers, csvPreview.rows, idColumn);
    // Server caps bulk creates at 200 per request (contracts UnitsCreateBodySchema); chunk accordingly.
    for (let i = 0; i < units.length; i += 200) {
      await createUnits.mutateAsync({ overwrite, units: units.slice(i, i + 200) });
    }
    setCsvPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">Units</h2>

      <div className="flex flex-col gap-2 rounded border p-3">
        <label className="text-sm font-medium">Upload units from CSV</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {csvPreview && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              {csvPreview.rows.length} row(s), {csvPreview.headers.length} column(s)
            </p>
            <div className="flex items-center gap-2">
              <label className="text-sm">External id column:</label>
              <select
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={idColumn}
                onChange={(e) => setIdColumn(e.target.value)}
              >
                {csvPreview.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              Overwrite existing units with the same external id
            </label>
            <Button type="button" onClick={handleUpload} disabled={createUnits.isPending} className="self-start">
              {createUnits.isPending ? "Uploading..." : `Upload ${csvPreview.rows.length} units`}
            </Button>
            {createUnits.isError && <p className="text-sm text-destructive">{createUnits.error.message}</p>}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        {unitsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        <p className="text-sm text-muted-foreground">{unitsQuery.data?.length ?? 0} unit(s)</p>
        {deleteUnit.isError && <p className="text-sm text-destructive">{deleteUnit.error.message}</p>}
        <div className="max-h-96 overflow-auto rounded border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="p-2">External id</th>
                <th className="p-2">Hash</th>
                <th className="p-2" />
              </tr>
            </thead>
            <tbody>
              {(unitsQuery.data ?? []).map((unit) => (
                <tr key={unit.id} className="border-b last:border-0">
                  <td className="p-2">{unit.externalId}</td>
                  <td className="p-2 font-mono text-xs text-muted-foreground">{unit.hash}</td>
                  <td className="p-2 text-right">
                    <button
                      type="button"
                      className="text-xs text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete unit "${unit.externalId}"?`)) deleteUnit.mutate(unit.id);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
