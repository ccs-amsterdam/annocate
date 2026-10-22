import type { UserVariableType } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type VariableItem = NonNullable<Extract<UserVariableType, { type: "scale" }>["items"]>[number];

/**
 * Repeatable-row editor for a `scale` variable's `items`: several statements
 * rated on the same scale. No items means a single rating.
 */
export function ScaleItemsEditor({
  items,
  onChange,
}: {
  items: VariableItem[] | undefined;
  onChange: (items: VariableItem[] | undefined) => void;
}) {
  const list = items ?? [];
  function update(index: number, patch: Partial<VariableItem>) {
    onChange(list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  function remove(index: number) {
    const next = list.filter((_, i) => i !== index);
    onChange(next.length ? next : undefined);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Items (optional)</label>
      <p className="text-[11px] text-muted-foreground">
        Rate several items on the same scale. The name is stored with the answer; the label is shown to coders.
      </p>
      {list.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            placeholder="name"
            value={item.name}
            onChange={(e) => update(i, { name: e.target.value })}
            className="w-32"
          />
          <Input
            placeholder="label"
            value={item.label ?? ""}
            onChange={(e) => update(i, { label: e.target.value || undefined })}
            className="flex-1"
          />
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} aria-label="Remove item">
            ✕
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...list, { name: `item_${list.length + 1}` }])}
        className="self-start"
      >
        + Add item
      </Button>
    </div>
  );
}
