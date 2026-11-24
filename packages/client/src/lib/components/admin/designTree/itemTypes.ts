import {
  CircleDashed,
  ArrowLeftRight,
  CircleCheck,
  Grid3x3,
  Hash,
  Highlighter,
  HelpCircle,
  ListOrdered,
  GitBranch,
  LogOut,
  FileStack,
  FlaskConical,
  LayoutTemplate,
  Shuffle,
  Spline,
  Sprout,
  Tag,
  type LucideIcon,
} from "lucide-react";
import type { AnyVariableType } from "@annotinder/contracts";
import type { ItemType, TreeNode } from "./utils";

// How each item type looks in the design tree. To tune the look, change the
// classes here: `color` is the icon's, `nameClass` the item's name's (font,
// weight, colour; a selected item is bold on top of it), `knotClass` the
// box of a loop's and a layout's knot on the main line, `containerClass` a
// loop's card. Questions end in a leaf (`--leaf`); the lines are `--twig`
// and the card `--paper` (theme tokens in index.css, light and dark).

interface ItemTypeInfo {
  label: string;
  description: string;
  icon: LucideIcon;
  /** The icon's classes (its colour). */
  color: string;
  /** The name's classes in the tree (font, weight, colour). */
  nameClass: string;
  /** The box of the item's knot on the main line (a loop's, a layout's). */
  knotClass?: string;
  /** The card holding a loop and its items. */
  containerClass?: string;
}

export const ITEM_TYPES: Record<ItemType, ItemTypeInfo> = {
  branch: {
    label: "Branch",
    description: "Items only some coders get: if a condition holds (else the else items)",
    icon: GitBranch,
    color: "text-secondary-dark",
    nameClass: "font-medium",
  },
  question: {
    label: "Question",
    description: "Prompt coder for an answer",
    icon: HelpCircle,
    // The leaf's colour
    color: "text-leaf",
    // Questions are named like variables (topic, age): apart from loops, layouts and branches
    nameClass: "font-mono text-[13px] font-normal text-foreground/75",
  },
  experiment: {
    label: "Experiment",
    description: "Each coder gets one of its conditions, drawn at random or balanced (never asked)",
    icon: FlaskConical,
    color: "text-secondary-dark",
    nameClass: "font-mono text-[13px] font-normal text-foreground/75",
  },
  unit_loop: {
    label: "Unit loop",
    description: "Loop over units (all, or a set)",
    icon: FileStack,
    // In a filled knot: the knot is the loop's colour
    color: "text-wood-foreground",
    nameClass: "font-semibold text-wood",
    knotClass: "rounded-[5px] bg-wood",
    containerClass: "rounded-xl border-[1.5px] border-wood/30 bg-paper",
  },
  layout: {
    label: "Layout",
    description: "How the unit is shown to the questions after it",
    icon: LayoutTemplate,
    // A knot on the loop's line, like the loop's: in a light box
    color: "text-leaf",
    nameClass: "text-wood",
    knotClass: "rounded-[5px] border-[1.5px] border-twig bg-card",
  },
  session: {
    label: "Session",
    description: "Who codes and URL parameters",
    // The Start row: a sprout where the main line begins
    icon: Sprout,
    color: "text-card",
    nameClass: "font-bold",
    knotClass: "rounded-full bg-leaf",
  },
  end: {
    label: "End",
    description: "End the session (screen out or complete)",
    icon: LogOut,
    color: "text-destructive",
    nameClass: "font-mono text-[13px] font-normal text-foreground/75",
  },
};

/** The answer types' icons (the type cards); in the tree a question is a leaf. */
export const ANSWER_TYPE_ICONS: Record<AnyVariableType["type"], LucideIcon> = {
  nominal: Tag,
  ordinal: ListOrdered,
  numeric: Hash,
  scale: Grid3x3,
  annotinder: ArrowLeftRight,
  confirm: CircleCheck,
  random: Shuffle,
  span: Highlighter,
  relation: Spline,
  unspecified: CircleDashed,
};

/** A question's answer type in a word, next to it in the tree (not yet chosen: none, it says "to specify"). */
const ANSWER_TYPE_WORDS: Record<AnyVariableType["type"], string> = {
  nominal: "choice",
  ordinal: "ordered",
  numeric: "number",
  scale: "scale",
  annotinder: "swipe",
  confirm: "confirm",
  random: "random",
  span: "spans",
  relation: "relations",
  unspecified: "",
};

export function answerTypeWord(item: TreeNode): string {
  if (item.type !== "question") return "";
  const variable = item.variable;
  if (variable.type === "nominal" && variable.multiple) return "choices";
  return ANSWER_TYPE_WORDS[variable.type] ?? "";
}
