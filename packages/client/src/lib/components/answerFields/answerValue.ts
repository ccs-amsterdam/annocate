import type { OptionValue, SpecialAnswer, SpecialKind, ValueAnswer, VariableValue } from "@annotinder/contracts";

/** An answer holding these values (docs/client.md §4): option values, or a special answer. */
export function buildValues(values: ValueAnswer[]): VariableValue {
  return {
    done: true,
    skip: false,
    values: values.map(({ value, item, special }) => ({
      ...(item !== undefined && { item }),
      ...(special !== undefined && { special }),
      ...(value !== undefined && { value }),
    })),
  };
}

/** A special answer (for a scale's item): its kind, and its code as the value if it has one. */
export const specialValue = (special: SpecialAnswer, item?: string): ValueAnswer => ({
  item,
  special: special.kind,
  value: special.value,
});

export function buildSkipValue(): VariableValue {
  return { done: true, skip: true };
}

/** The option values of an earlier answer (for reviewing it), without the item answers and special answers. */
export function initialValues(initialValue: VariableValue | undefined): OptionValue[] {
  return (initialValue?.values ?? []).flatMap((v) =>
    v.item === undefined && !v.special && v.value !== undefined ? [v.value] : [],
  );
}

/** The special answer of an earlier answer, if it was one. */
export function initialSpecial(initialValue: VariableValue | undefined): SpecialKind | undefined {
  return initialValue?.values?.find((v) => v.item === undefined)?.special;
}
