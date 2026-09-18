import type { CodebookCode } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Shared repeatable-row editor for a variable's `codes` array (design plan §5.2). */
export function CodesEditor({
  codes,
  onChange,
  max,
}: {
  codes: CodebookCode[];
  onChange: (codes: CodebookCode[]) => void;
  max?: number;
}) {
  function update(index: number, patch: Partial<CodebookCode>) {
    onChange(codes.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }
  function remove(index: number) {
    onChange(codes.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...codes, { code: "" }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Codes</label>
      {codes.map((code, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="code"
            value={code.code}
            onChange={(e) => update(i, { code: e.target.value })}
            className="w-32"
          />
          <Input
            placeholder="color"
            value={code.color ?? ""}
            onChange={(e) => update(i, { color: e.target.value || undefined })}
            className="w-24"
          />
          <Input
            placeholder="value"
            type="number"
            value={code.value ?? ""}
            onChange={(e) => update(i, { value: e.target.value === "" ? undefined : Number(e.target.value) })}
            className="w-20"
          />
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={!!code.screenOut}
              onChange={(e) => update(i, { screenOut: e.target.checked || undefined })}
            />
            screen out
          </label>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} aria-label="Remove code">
            ✕
          </Button>
        </div>
      ))}
      {(!max || codes.length < max) && (
        <Button type="button" variant="outline" size="sm" onClick={add} className="self-start">
          + Add code
        </Button>
      )}
    </div>
  );
}
