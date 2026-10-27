import type { ScaleItem } from "@annotinder/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Repeatable-row editor for a `scale` variable's `items`: the statements
 * rated on the same options. The name is stored with the answer
 * (`$var.q.items.<name>`); the label is shown to coders.
 */
export function ScaleItemsEditor({ items, onChange }: { items: ScaleItem[]; onChange: (items: ScaleItem[]) => void }) {
  function update(index: number, patch: Partial<ScaleItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Items</label>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input placeholder="name" value={item.name} onChange={(e) => update(i, { name: e.target.value })} className="w-32" />
          <Input
            placeholder="label"
            value={item.label ?? ""}
            onChange={(e) => update(i, { label: e.target.value || undefined })}
            className="flex-1"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={items.length === 1}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label="Remove item"
          >
            ✕
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...items, { name: `item_${items.length + 1}` }])}
        className="self-start"
      >
        + Add item
      </Button>
    </div>
  );
}
