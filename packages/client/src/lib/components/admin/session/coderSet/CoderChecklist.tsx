import type { CoderResponse } from "@annotinder/contracts";

/** The study's expert coders as a checklist: those checked get units. */
export function CoderChecklist({
  experts,
  selected,
  onChange,
  onManage,
}: {
  experts: readonly CoderResponse[];
  selected: readonly string[];
  /** The checked coders, in the list's order. */
  onChange: (selected: string[]) => void;
  /** Opens "Manage coders", to add coders. */
  onManage: () => void;
}) {
  const toggle = (coder: string, checked: boolean) =>
    onChange(experts.map((c) => c.coder).filter((c) => (c === coder ? checked : selected.includes(c))));
  const linkClass = "cursor-pointer text-primary underline-offset-2 hover:underline";
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 flex w-full items-center gap-3 text-xs font-semibold">
        Coders ({selected.length} of {experts.length})
        <button type="button" className={linkClass} onClick={() => onChange(experts.map((c) => c.coder))}>
          All
        </button>
        <button type="button" className={linkClass} onClick={() => onChange([])}>
          None
        </button>
        <button type="button" className={`ml-auto ${linkClass}`} onClick={onManage}>
          Add or change coders…
        </button>
      </legend>
      <div className="grid max-h-40 gap-x-4 gap-y-1 overflow-y-auto rounded-md border border-border p-2 sm:grid-cols-2">
        {experts.map((c) => (
          <label key={c.coder} className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={selected.includes(c.coder)}
              onChange={(e) => toggle(c.coder, e.target.checked)}
            />
            <span className="truncate font-mono" title={c.email ?? undefined}>
              {c.coder}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
