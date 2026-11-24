import { CompactRow, EndLabels, SpecialAnswersRow } from "./OptionButtons";
import { itemLabel, type ScaleRowsProps } from "./scaleRows";

/** A scale as a row of values per item, under the labels of the scale's ends. */
export function ScaleCompactRows({
  items,
  points,
  specials,
  selected,
  onSelect,
  onSelectSpecial,
  active,
  rowRef,
  highlight,
}: ScaleRowsProps) {
  return (
    <>
      <EndLabels options={points} />
      <div className="flex flex-col gap-1.5">
        {items.map((item, i) => {
          const answer = selected[item.name];
          return (
            <div key={item.name} ref={rowRef(item.name)} className={`flex flex-col gap-0.5 ${highlight(item.name)}`}>
              <div className="text-center text-sm text-foreground">{itemLabel(item)}</div>
              <div className="flex items-center gap-1.5">
                <CompactRow
                  options={points}
                  selected={answer?.special ? undefined : answer?.value}
                  onSelect={(o) => onSelect(item.name, o)}
                  label={itemLabel(item)}
                />
                <SpecialAnswersRow
                  specials={specials}
                  selected={answer?.special}
                  onPick={(special) => onSelectSpecial(item.name, special)}
                  keys={i === active}
                  className="flex shrink-0 gap-1"
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
