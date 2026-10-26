import { GitBranch, HelpCircle, Repeat, type LucideIcon } from "lucide-react";
import type { ItemType } from "./utils";

interface ItemTypeInfo {
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  /** Tint and left border of the block wrapping a container and its children. */
  blockClass?: string;
}

export const ITEM_TYPES: Record<ItemType, ItemTypeInfo> = {
  question: {
    label: "Question",
    description: "Prompt coder for an answer",
    icon: HelpCircle,
    color: "text-blue-500",
  },
  unit_loop: {
    label: "Unit Loop",
    description: "Loop over units in a unitset",
    icon: Repeat,
    color: "text-primary",
    blockClass: "bg-black/5 mt-2",
  },
  condition: {
    label: "Condition",
    description: "Show items only if rules or a script hold",
    icon: GitBranch,
    color: "",
    blockClass: "",
  },
  // Legacy variable types render like questions
  unit_variable: {
    label: "Unit variable",
    description: "",
    icon: HelpCircle,
    color: "text-blue-500",
  },
  user_variable: {
    label: "User variable",
    description: "",
    icon: HelpCircle,
    color: "text-blue-500",
  },
};
