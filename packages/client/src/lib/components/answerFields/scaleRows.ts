import type { Option, SpecialAnswer, ValueAnswer } from "@annotinder/contracts";
import type { QuestionVariable } from "./types";

// What the two layouts of a scale question share (ScaleGrid, ScaleCompactRows).

export type ScaleVariable = Extract<QuestionVariable, { type: "scale" }>;
export type ScaleItem = ScaleVariable["items"][number];

export const itemLabel = (item: { name: string; label?: string }) => item.label ?? item.name.replaceAll("_", " ");

/** A scale's items to rate, with the answers so far. */
export interface ScaleRowsProps {
  items: ScaleItem[];
  /** The scale's points. */
  points: Option[];
  /** Its special answers (don't know, not applicable), apart, for each item. */
  specials: SpecialAnswer[];
  /** Each answered item's answer, by the item's name. */
  selected: Record<string, ValueAnswer>;
  onSelect: (item: string, option: Option) => void;
  onSelectSpecial: (item: string, special: SpecialAnswer) => void;
  /** The index of the item the keyboard answers: the first unanswered (-1: none). */
  active: number;
  /** For an item's row: Continue scrolls to the first unanswered one. */
  rowRef: (item: string) => (el: HTMLElement | null) => void;
  /** An item's classes: the unanswered item Continue pointed out is highlighted. */
  highlight: (item: string) => string;
}
