import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** A new coder for the coder set, by name or email address; not one there already is. */
export function AddCoderForm({ taken, onAdd }: { taken: (name: string) => boolean; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const isTaken = name.trim() !== "" && taken(name);
  return (
    <form
      className="flex flex-wrap items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        onAdd(name.trim());
        setName("");
      }}
    >
      <Input
        aria-label="New coder"
        placeholder="New coder (a name or an email address)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="h-8 w-72"
      />
      <Button size="sm" variant="outline" type="submit" className="gap-1" disabled={!name.trim() || isTaken}>
        <UserPlus className="h-3.5 w-3.5" /> Add coder
      </Button>
      {isTaken && <span className="text-xs text-destructive">There is a coder with this name.</span>}
    </form>
  );
}
