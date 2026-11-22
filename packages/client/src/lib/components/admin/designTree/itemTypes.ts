import {
  CircleDashed,
  ArrowLeftRight,
  CircleCheck,
  GitBranch,
  Grid3x3,
  Hash,
  Highlighter,
  HelpCircle,
  ListOrdered,
  Link2,
  ListChecks,
  LogOut,
  FileStack,
  Shuffle,
  Spline,
  Tag,
  Tags,
  type LucideIcon,
} from "lucide-react";
import type { AnyVariableType } from "@annotinder/contracts";
import type { ItemType, TreeNode } from "./utils";

interface ItemTypeInfo {
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  /** Extra classes on the card wrapping a block (a loop, a Questions block) and its children. */
  blockClass?: string;
}

export const ITEM_TYPES: Record<ItemType, ItemTypeInfo> = {
  questions: {
    label: "Questions",
    description: "A block of questions for coders (before, between or after unit loops)",
    icon: ListChecks,
    color: "text-secondary-dark",
    blockClass: "",
  },
  question: {
    label: "Question",
    description: "Prompt coder for an answer",
    icon: HelpCircle,
    color: "text-[var(--iconcolor,var(--color-muted-foreground))]",
  },
  computed: {
    label: "Computed variable",
    description: "A value AnnoTinder works out when coders reach it, never asked (e.g. a random condition)",
    icon: Shuffle,
    color: "text-[var(--iconcolor,var(--color-muted-foreground))]",
  },
  unit_loop: {
    label: "Unit loop",
    description: "Loop over units (all, or a set)",
    icon: FileStack,
    color: "text-primary-dark",
    blockClass: "[--iconcolor:var(--color-primary-dark)]",
  },
  show_if: {
    label: "Show if",
    description: "Show items only if rules or a script hold",
    icon: GitBranch,
    color: "text-secondary-dark",
    blockClass: "",
  },
  session: {
    label: "Session",
    description: "Coder unit assignments and URL parameters",
    icon: Link2,
    color: "text-muted-foreground",
  },
  end: {
    label: "End",
    description: "End the session (screen out or complete)",
    icon: LogOut,
    color: "text-destructive",
  },
};

/** Questions are shown with the icon of their answer type. */
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

/** The icon of an item: its type's, or for a question its answer type's. */
export function itemIcon(item: TreeNode): LucideIcon {
  if ("variable" in item && item.variable) {
    if (item.variable.type === "nominal" && item.variable.multiple) return Tags;
    return ANSWER_TYPE_ICONS[item.variable.type] ?? ITEM_TYPES[item.type].icon;
  }
  return ITEM_TYPES[item.type].icon;
}
