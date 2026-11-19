import type { LucideIcon } from "lucide-react";
import { Shuffle } from "lucide-react";
import type { AnyVariableType } from "@annotinder/contracts";
import { ANSWER_TYPE_ICONS } from "./designTree/itemTypes";

/** A kind to choose from: an answer type of a question, or what a computed variable computes. */
export interface TypeCard<T extends string> {
  type: T;
  label: string;
  description: string;
  icon: LucideIcon;
}

type AnswerType = Exclude<AnyVariableType["type"], "unspecified" | "random">;

const ANSWER_TYPE_TEXT: Record<AnswerType, { label: string; description: string }> = {
  nominal: { label: "Categories", description: "One or several of a list of options" },
  ordinal: { label: "Ordered options", description: "Options in an order, such as a 1 to 5 rating" },
  numeric: { label: "Number", description: "A number, optionally within a range" },
  scale: { label: "Scale", description: "Several items, each rated on the same options" },
  annotinder: { label: "Swipe", description: "Swipe the unit left, right or up" },
  confirm: { label: "Confirm", description: "One button, e.g. to agree or continue" },
  span: { label: "Mark text", description: "Select words or passages in the unit" },
  relation: { label: "Relations", description: "Link marked passages to each other" },
};

/** The answer types a question can have, as cards (in a unit loop also marking text and relations). */
export function answerTypeCards(types: readonly string[]): TypeCard<AnswerType>[] {
  return types
    .filter((type): type is AnswerType => type in ANSWER_TYPE_TEXT)
    .map((type) => ({ type, ...ANSWER_TYPE_TEXT[type], icon: ANSWER_TYPE_ICONS[type] }));
}

/** What a computed variable can compute (a formula comes later). */
export const COMPUTED_TYPE_CARDS: TypeCard<"random">[] = [
  { type: "random", label: "Random condition", description: "Drawn at random or balanced, e.g. an experimental group", icon: Shuffle },
];
