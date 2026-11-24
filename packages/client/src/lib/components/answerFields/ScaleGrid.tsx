import { optionLabel, specialLabel, type Option, type SpecialAnswer } from "@annotinder/contracts";
import { itemLabel, type ScaleItem, type ScaleRowsProps } from "./scaleRows";

/** A scale as a table: an item per row, the points (and the special answers, apart) as column heads. */
export function ScaleGrid({
  items,
  points,
  specials,
  specialBadges,
  ...rows
}: ScaleRowsProps & {
  /** Each special answer's key, for its column head. */
  specialBadges: (string | null)[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1 text-sm">
        <thead>
          <tr>
            <th />
            {points.map((option) => (
              <th key={String(option.value)} className="px-1 text-center text-xs font-normal text-muted-foreground">
                {optionLabel(option)}
              </th>
            ))}
            {specials.map((special, i) => (
              <th
                key={special.kind}
                className={`px-1 text-center text-xs font-normal text-muted-foreground ${specialColumn(i)}`}
              >
                {specialLabel(special)}
                {specialBadges[i] && (
                  <span className="ml-1 rounded border px-1 font-mono text-[10px]">{specialBadges[i]}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <ScaleGridRow key={item.name} item={item} points={points} specials={specials} {...rows} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The special answers are apart from the points: a dashed line before the first. */
const specialColumn = (index: number) => (index === 0 ? "border-l border-dashed border-border" : "");

/** An item's row: a radio button per point and per special answer. */
function ScaleGridRow({
  item,
  points,
  specials,
  selected,
  onSelect,
  onSelectSpecial,
  rowRef,
  highlight,
}: Omit<ScaleRowsProps, "items" | "active"> & { item: ScaleItem }) {
  const answer = selected[item.name];
  const isPoint = (option: Option) => !answer?.special && answer?.value === option.value;
  return (
    <tr ref={rowRef(item.name)} className={highlight(item.name)}>
      <th scope="row" className="pr-2 text-left font-normal">
        {itemLabel(item)}
      </th>
      {points.map((option) => (
        <td key={String(option.value)} className="text-center">
          <ScaleRadio
            item={item}
            label={optionLabel(option)}
            checked={isPoint(option)}
            onChange={() => onSelect(item.name, option)}
          />
        </td>
      ))}
      {specials.map((special, i) => (
        <td key={special.kind} className={`text-center ${specialColumn(i)}`}>
          <ScaleRadio
            item={item}
            label={specialLabel(special)}
            checked={answer?.special === special.kind}
            special={special.kind}
            onChange={() => onSelectSpecial(item.name, special)}
          />
        </td>
      ))}
    </tr>
  );
}

function ScaleRadio({
  item,
  label,
  checked,
  special,
  onChange,
}: {
  item: ScaleItem;
  /** The answer's label. */
  label: string;
  checked: boolean;
  /** For a special answer: its kind. */
  special?: SpecialAnswer["kind"];
  onChange: () => void;
}) {
  return (
    <input
      type="radio"
      className="size-5 cursor-pointer accent-primary"
      name={`${item.name}`}
      aria-label={`${itemLabel(item)}: ${label}`}
      checked={checked}
      data-key-target=""
      data-special={special}
      onChange={onChange}
    />
  );
}
