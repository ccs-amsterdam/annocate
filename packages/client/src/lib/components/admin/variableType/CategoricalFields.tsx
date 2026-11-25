import { NOMINAL_LAYOUTS, ORDINAL_LAYOUTS, type AnyVariableType, type CategoricalType } from "@annotinder/contracts";
import { OptionsEditor, type OptionSource } from "../OptionsEditor";
import { LayoutSelect, selectClass } from "./LayoutSelect";

/** Options, several answers (nominal) and layout of a nominal or ordinal question. */
export function CategoricalFields({
  variable: v,
  sources = [],
  onChange,
}: {
  variable: CategoricalType;
  /** Where options from data can come from (category questions). */
  sources?: OptionSource[];
  onChange: (next: AnyVariableType) => void;
}) {
  const ordinal = v.type === "ordinal";
  const setLayout = (layout: string) => {
    const next = { ...v, layout: layout === "auto" ? undefined : layout } as CategoricalType;
    if (layout !== "grid") delete next.columns;
    onChange(next);
  };
  return (
    <>
      {v.type === "ordinal" ? (
        <OptionsEditor
          key="ordinal"
          level="ordinal"
          options={v.options}
          onChange={(options) => onChange({ ...v, options })}
          specials={v.specials}
          onSpecials={(specials) => onChange({ ...v, specials })}
        />
      ) : (
        <OptionsEditor
          key="nominal"
          options={v.options}
          onChange={(options) => onChange({ ...v, options })}
          specials={v.specials}
          onSpecials={(specials) => onChange({ ...v, specials })}
          specialsText
          from={v.optionsFrom}
          sources={sources}
          onFrom={(optionsFrom) => {
            const next = { ...v, optionsFrom };
            if (!optionsFrom) delete next.optionsFrom;
            onChange(next);
          }}
        />
      )}
      {v.type === "nominal" && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!v.multiple}
            onChange={(e) => onChange({ ...v, multiple: e.target.checked || undefined })}
          />
          Allow several answers
        </label>
      )}
      <LayoutSelect variable={v} layouts={ordinal ? ORDINAL_LAYOUTS : NOMINAL_LAYOUTS} onChange={setLayout} />
      {v.layout === "grid" && (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium">Columns</label>
          <select
            className={selectClass}
            value={v.columns ?? 1}
            onChange={(e) => onChange({ ...v, columns: Number(e.target.value) })}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      )}
    </>
  );
}
