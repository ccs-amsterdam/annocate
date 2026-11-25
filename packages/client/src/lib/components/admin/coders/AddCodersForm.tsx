import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import type { ResearcherApi } from "../../../api/httpResearcherApi";
import { codersToCreate, parseCoders, type ParsedCoder } from "../../../admin/parseCoders";
import { useCoderMutations } from "../../../admin/queries";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Adds expert coders from a text: one per line, an id or an id and an email
 * address (comma, semicolon or tab between them; a header line is skipped),
 * or with "the coder id is the email address" an address per line. What was
 * read shows below, with what is wrong per line, before anything is saved.
 */
export function AddCodersForm({
  client,
  existing,
  onAdded,
}: {
  client: ResearcherApi;
  /** The study's coders: their ids and addresses are taken. */
  existing: readonly { coder: string; email: string | null }[];
  onAdded?: () => void;
}) {
  const { create } = useCoderMutations(client);
  const [text, setText] = useState("");
  const [idIsEmail, setIdIsEmail] = useState(false);
  const parsed = parseCoders(text, { idIsEmail, existing });
  const body = codersToCreate(parsed);

  const save = () =>
    body &&
    create.mutate(body, {
      onSuccess: () => {
        setText("");
        onAdded?.();
      },
    });

  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex flex-col gap-1 text-xs font-semibold">
        {idIsEmail ? "Email addresses, one per line" : "Coders, one per line: an id, or an id and an email address"}
        <Textarea
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={idIsEmail ? "anna@uni.nl\nbob@uni.nl" : "anna, anna@uni.nl\nbob; bob@uni.nl\ncarla"}
          className="font-mono text-xs font-normal"
        />
      </label>
      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={idIsEmail}
          onChange={(e) => setIdIsEmail(e.target.checked)}
        />
        <span>
          The coder id is the email address
          <span className="block text-muted-foreground">
            The id is what your results call the coder, and it never changes. With their address as id, results name
            coders by address.
          </span>
        </span>
      </label>
      <CodersPreview parsed={parsed} />
      {create.isError && <p className="text-xs text-destructive">{create.error.message}</p>}
      <div>
        <Button size="sm" className="gap-1.5" disabled={body === null || create.isPending} onClick={save}>
          {create.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          {body ? `Add ${body.coders.length} coder${body.coders.length === 1 ? "" : "s"}` : "Add coders"}
        </Button>
      </div>
    </div>
  );
}

/** What was read from the text: a row per line, with what is wrong with it. */
function CodersPreview({ parsed }: { parsed: ParsedCoder[] }) {
  if (parsed.length === 0) return null;
  const errors = parsed.filter((p) => p.error !== null).length;
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        {parsed.length} line{parsed.length === 1 ? "" : "s"} read
        {errors > 0 && (
          <span className="text-destructive">
            , {errors} with a problem: fix {errors === 1 ? "it" : "them"} to add the coders
          </span>
        )}
      </p>
      <div className="max-h-48 overflow-y-auto rounded-md border">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              <th className="px-2 py-1 font-medium">Line</th>
              <th className="px-2 py-1 font-medium">Coder id</th>
              <th className="px-2 py-1 font-medium">Email</th>
              <th className="px-2 py-1 font-medium">Problem</th>
            </tr>
          </thead>
          <tbody>
            {parsed.map((p) => (
              <tr key={p.line} className={p.error ? "border-t bg-destructive/5" : "border-t"}>
                <td className="px-2 py-1 text-muted-foreground tabular-nums">{p.line}</td>
                <td className="px-2 py-1 font-mono">{p.coder}</td>
                <td className="px-2 py-1 font-mono">{p.email ?? "–"}</td>
                <td className="px-2 py-1 text-destructive">{p.error}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
