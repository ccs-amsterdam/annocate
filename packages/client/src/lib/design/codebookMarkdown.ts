import {
  fieldUsage,
  unitLoops,
  loopTitle,
  type AnyVariableType,
  type DesignItem,
  type TopLevelItem,
  type UnitLoopItem,
} from "@annotinder/contracts";

// The codebook as a document (docs/glossary.md): what coders see,
// for a paper's appendix or a colleague: questions with their instructions
// and options, conditions, the unit fields coders are shown, end messages.
// Not the design's internals: who codes which units, sets, gold and
// practice settings, the coder unit assignment.

/** How each answer type is described in the codebook. */
const TYPE: Record<AnyVariableType["type"], string> = {
  nominal: "Choose an option",
  ordinal: "Choose a point on a scale",
  annotinder: "Swipe",
  numeric: "A number",
  confirm: "Confirm",
  scale: "A scale per item",
  span: "Select spans in the text",
  relation: "Relations between spans",
  random: "Drawn at random, not asked",
  unspecified: "Not specified yet",
};

/** A question's options, range, scale items or span fields, as list lines. */
function optionLines(variable: AnyVariableType): string[] {
  const lines: string[] = [];
  if ("options" in variable && Array.isArray(variable.options)) {
    for (const o of variable.options as { value: unknown; label?: string }[]) {
      lines.push(
        o.label && o.label !== String(o.value) ? `- \`${String(o.value)}\`: ${o.label}` : `- \`${String(o.value)}\``,
      );
    }
  }
  if (variable.type === "numeric") {
    const range = [
      variable.min !== undefined ? `from ${variable.min}` : "",
      variable.max !== undefined ? `to ${variable.max}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    if (range) lines.push(`- ${range}`);
  }
  if (variable.type === "scale") {
    lines.push("Items:", ...(variable.items ?? []).map((i) => `- \`${i.name}\`: ${i.label ?? i.name}`));
  }
  if (variable.type === "span") lines.push(`- In: ${(variable.fields ?? []).map((f) => `\`${f}\``).join(", ")}`);
  if ("multiple" in variable && variable.multiple) lines.push("- Several answers allowed");
  return lines;
}

/** A question (or computed item): heading, text, instruction, answer type and options. */
function question(name: string, variable: AnyVariableType, depth: number, instruction?: string): string[] {
  const text =
    "question" in variable && typeof variable.question === "string" && variable.question ? variable.question : "";
  const out = [`${"#".repeat(depth)} ${name}${text ? `: ${text.split("\n")[0]}` : ""}`, ""];
  if (text.includes("\n")) out.push(text, "");
  if (instruction) out.push(...instruction.split("\n").map((l) => `> ${l}`), "");
  out.push(`*${TYPE[variable.type] ?? variable.type}*`, "");
  const options = optionLines(variable);
  if (options.length > 0) out.push(...options, "");
  return out;
}

/** The loops' keys, as numbered in the whole codebook (for their titles). */
type LoopKeys = Map<unknown, string>;

/** The lines for a list of items, at heading `depth`. */
function items(list: DesignItem[], depth: number, keys: LoopKeys): string[] {
  const out: string[] = [];
  for (const item of list) {
    if (item.type === "session") continue;
    if (item.type === "block") {
      const label = item.label ? `${item.label}: ` : "";
      out.push(
        ...(item.condition
          ? [`*Only if ${label}\`${item.condition.script}\`*`, ""]
          : label
            ? [`*${item.label}*`, ""]
            : []),
        ...items((item.children ?? []) as DesignItem[], depth, keys),
        ...(item.elseChildren?.length
          ? ["*Otherwise:*", "", ...items(item.elseChildren as DesignItem[], depth, keys)]
          : []),
      );
    } else if (item.type === "end") {
      out.push(
        `${"#".repeat(depth)} End: ${item.name} (${item.outcome})`,
        "",
        ...(item.message ? [item.message, ""] : []),
      );
    } else if (item.type === "unit_loop") {
      out.push(...loop(item as UnitLoopItem, depth, keys));
    } else if ("variable" in item) {
      out.push(
        ...question(
          item.name,
          item.variable as AnyVariableType,
          depth,
          "instruction" in item && typeof item.instruction === "string" ? item.instruction : undefined,
        ),
      );
    }
  }
  return out;
}

/** A unit loop: its title, the fields coders see, and its items one level deeper. */
function loop(item: UnitLoopItem, depth: number, keys: LoopKeys): string[] {
  const key = keys.get(item) ?? "1";
  const shown = [...fieldUsage([item])].filter(([, use]) => use === "shown").map(([f]) => `\`${f}\``);
  return [
    `${"#".repeat(depth)} For each unit: ${loopTitle(item, key)}`,
    "",
    ...(shown.length > 0 ? [`Coders see the unit's ${shown.join(", ")}.`, ""] : []),
    ...items((item.children ?? []) as DesignItem[], depth + 1, keys),
  ];
}

/** The codebook (its items, the session among them or not) as Markdown. */
export function codebookMarkdown(list: readonly TopLevelItem[], title = "Codebook", note?: string | null): string {
  const out = [
    `# ${title}`,
    "",
    ...(note ? [note, ""] : []),
    ...items(list as DesignItem[], 2, new Map(unitLoops(list).map(({ loop, key }) => [loop, key]))),
  ];
  return (
    out
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n"
  );
}
