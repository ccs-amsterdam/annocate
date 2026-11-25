import { valueFromLabel, type Option } from "@annotinder/contracts";

/** Values that follow the order: 1..n. */
export function renumber<T extends Option>(options: T[]): T[] {
  return options.map((o, i) => ({ ...o, value: i + 1 }));
}

/** Whether ordinal values follow the order: 1..n. */
export function isSequence(options: Option[]): boolean {
  return options.every((o, i) => o.value === i + 1);
}

/** Whether ordinal values rise in the order of the options. */
export function isRising(options: Option[]): boolean {
  return options.every(
    (o, i) => i === 0 || (typeof o.value === "number" && o.value > (options[i - 1].value as number)),
  );
}

/** The value a new option starts with: the next number (ordinal), or empty until it has a label. */
export function newOptionValue(options: Option[], ordinal: boolean): string | number {
  if (!ordinal) return "";
  const last = options[options.length - 1]?.value;
  return typeof last === "number" ? last + 1 : 1;
}

/** The options with the one at `index` moved `by` places. */
export function moveOption<T>(options: T[], index: number, by: number): T[] {
  const next = [...options];
  const [moved] = next.splice(index, 1);
  next.splice(index + by, 0, moved);
  return next;
}

/**
 * What a new label changes. A nominal option's value follows its label
 * while it was derived from it (or is empty), unless it is in the deployed
 * design: coders may already have given it.
 */
export function labelPatch(option: Option, label: string, followLabel: boolean): Partial<Option> {
  const patch: Partial<Option> = { label: label === "" ? undefined : label };
  const derived = option.value === "" || option.value === valueFromLabel(option.label ?? String(option.value));
  if (followLabel && derived) patch.value = valueFromLabel(label);
  return patch;
}
