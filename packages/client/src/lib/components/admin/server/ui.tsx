import type { ReactNode } from "react";
import { errorText } from "./shared";

/** A table with a header row. */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className="p-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** An error message, if there is an error. */
export function ErrorLine({ error }: { error: unknown }) {
  return error ? <p className="text-sm text-destructive">{errorText(error)}</p> : null;
}
