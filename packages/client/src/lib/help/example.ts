import type { AnyVariableType, ReferenceScope, VariableValue } from "@annotinder/contracts";
import { buildScope } from "@annotinder/contracts";

// Live template examples in help topics: a fenced block with the language
// `example`. An optional header, up to a `---` line, gives the data:
//
//   unit:
//     headline: Storm hits the coast
//     text: |
//       Several lines,
//       indented further.
//   answers:
//     group: experiment | control | -
//   snippets:
//     note: A **bold** note.
//   steps: topic, sentiment
//   ---
//   # $unit.headline
//
// `answers` are the coder's answers; with alternatives (`a | b`) the reader
// can switch between them, `-` is "not answered". A number makes a numeric
// question, anything else a nominal one with those options. `steps` are
// the loop's questions, for `::: from` blocks: the reader picks the one
// on screen.

export interface HelpExampleData {
  unit: Record<string, string | number>;
  /** Per question its alternatives; `null` is "not answered". */
  answers: Record<string, (string | number | null)[]>;
  snippets?: Record<string, string>;
  steps: string[];
  template: string;
}

const NUMBER = /^-?\d+(\.\d+)?$/;

/** Reads an example block. */
export function parseExample(source: string): HelpExampleData {
  const lines = source.replace(/\n$/, "").split("\n");
  const end = lines.indexOf("---");
  const data: HelpExampleData = { unit: {}, answers: {}, steps: [], template: (end < 0 ? lines : lines.slice(end + 1)).join("\n") };
  if (end < 0) return data;

  const header = lines.slice(0, end);
  let section: Record<string, string> | null = null;
  const sections: Record<string, Record<string, string>> = {};
  for (let i = 0; i < header.length; i++) {
    const line = header[i];
    const top = /^([a-z]+):\s*(.*)$/.exec(line);
    if (top) {
      if (top[2]) {
        if (top[1] !== "steps") throw new Error(`Example: "${top[1]}" takes indented entries`);
        data.steps = top[2].split(",").map((s) => s.trim());
        section = null;
      } else section = sections[top[1]] = {};
      continue;
    }
    const entry = /^ {2}([A-Za-z_]\w*):\s?(.*)$/.exec(line);
    if (!entry || !section) {
      if (line.trim()) throw new Error(`Example: can't read "${line}"`);
      continue;
    }
    if (entry[2] === "|") {
      const block: string[] = [];
      while (i + 1 < header.length && (header[i + 1].startsWith("    ") || header[i + 1].trim() === "")) block.push(header[++i].slice(4));
      section[entry[1]] = block.join("\n").replace(/\n+$/, "");
    } else section[entry[1]] = entry[2];
  }
  for (const [key, value] of Object.entries(sections.unit ?? {})) data.unit[key] = NUMBER.test(value) ? Number(value) : value;
  for (const [key, value] of Object.entries(sections.answers ?? {})) {
    data.answers[key] = value.split("|").map((v) => v.trim()).map((v) => (v === "-" ? null : NUMBER.test(v) ? Number(v) : v));
  }
  if (sections.snippets) data.snippets = sections.snippets;
  return data;
}

/** The example's questions: numeric if all its answers are numbers, else nominal with them as options. */
function exampleQuestion(alternatives: (string | number | null)[]): AnyVariableType {
  const given = alternatives.filter((a) => a !== null);
  return (
    given.length && given.every((a) => typeof a === "number")
      ? { type: "numeric", question: "?" }
      : { type: "nominal", question: "?", options: given.map((value) => ({ value: String(value) })) }
  ) as AnyVariableType;
}

/**
 * The example as a codebook, for checking it: its answers as questions
 * before a loop (those in `steps` in the loop, in that order, the other
 * steps as confirm questions), and the template as the loop's layout.
 */
export function exampleCodebook(data: HelpExampleData): unknown[] {
  const question = (name: string, variable: AnyVariableType) => ({ type: "question", name, variable });
  const confirm = { type: "confirm", question: "?" } as AnyVariableType;
  return [
    ...Object.entries(data.answers)
      .filter(([name]) => !data.steps.includes(name))
      .map(([name, alternatives]) => question(name, exampleQuestion(alternatives))),
    {
      type: "unit_loop",
      units: [{ mode: "all", unitset: "__all__" }],
      layout: { template: data.template, ...(data.snippets ? { snippets: data.snippets } : {}) },
      children: data.steps.length
        ? data.steps.map((name) => question(name, data.answers[name] ? exampleQuestion(data.answers[name]) : confirm))
        : [question("done", confirm)],
    },
  ];
}

/** The scope for a choice of answers (one per question). */
export function exampleScope(data: HelpExampleData, chosen: Record<string, string | number | null>): ReferenceScope {
  const questions = new Map<string, AnyVariableType>();
  const answers: Record<string, VariableValue | undefined> = {};
  for (const [name, alternatives] of Object.entries(data.answers)) {
    questions.set(name, exampleQuestion(alternatives));
    const value = chosen[name];
    if (value !== null && value !== undefined) answers[name] = { values: [{ value: questions.get(name)!.type === "numeric" ? value : String(value) }] } as VariableValue;
  }
  for (const step of data.steps) if (!questions.has(step)) questions.set(step, { type: "confirm" } as AnyVariableType);
  return buildScope(questions, answers, data.unit);
}
