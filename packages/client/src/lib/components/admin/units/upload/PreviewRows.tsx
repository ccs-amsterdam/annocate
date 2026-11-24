import { type UnitField } from "@annotinder/contracts";
import { csvToUnits } from "../../../../admin/csv";

export function PreviewRows({ fields, units }: { fields: UnitField[]; units: ReturnType<typeof csvToUnits>["units"] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-muted-foreground">
            <th className="p-1.5 font-medium">id</th>
            {fields.map((f) => (
              <th key={f.name} className="p-1.5 font-medium">
                {f.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.externalId} className="border-b last:border-0">
              <td className="p-1.5 font-mono">{u.externalId}</td>
              {fields.map((f) => (
                <td key={f.name} className="max-w-48 truncate p-1.5">
                  {u.data[f.name] === null || u.data[f.name] === undefined ? (
                    <span className="text-muted-foreground">empty</span>
                  ) : (
                    String(u.data[f.name])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
