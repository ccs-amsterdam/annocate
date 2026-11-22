import type { AnswerAlternative, AnyVariableType } from "@annotinder/contracts";

/**
 * The default feedback on a wrong practice answer (docs/architecture.md
 * §6.2), when the practice unit gives no message: `The expected answer to
 * "…" is …`, with the options' labels.
 */
export function expectedAnswerText(
  name: string,
  variable: AnyVariableType | undefined,
  key: AnswerAlternative[],
): string {
  const question = variable as { question?: string; options?: { value: unknown; label?: string }[] } | undefined;
  const label = (value: string) => question?.options?.find((o) => String(o.value) === value)?.label ?? value;
  const right = key.map((alt) =>
    "range" in alt ? `between ${alt.range[0]} and ${alt.range[1]}` : alt.values.map(label).join(" and "),
  );
  const text = question?.question ? `"${question.question}"` : name;
  return `The expected answer to ${text} is ${right.join(" or ")}.`;
}
