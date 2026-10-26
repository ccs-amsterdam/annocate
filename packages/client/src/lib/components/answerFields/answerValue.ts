import type { OptionValue, VariableValue } from "@annotinder/contracts";

/** An answer holding these values (docs/client.md §4). */
export function buildValues(values: { value: OptionValue; item?: string }[]): VariableValue {
  return { done: true, skip: false, values: values.map(({ value, item }) => (item === undefined ? { value } : { item, value })) };
}

export function buildSkipValue(): VariableValue {
  return { done: true, skip: true };
}

/** The values of an earlier answer (for reviewing it), without the item answers. */
export function initialValues(initialValue: VariableValue | undefined): OptionValue[] {
  return (initialValue?.values ?? []).filter((v) => v.item === undefined).map((v) => v.value);
}
