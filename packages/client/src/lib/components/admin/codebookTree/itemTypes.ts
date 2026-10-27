import {
  ArrowLeftRight,
  CircleCheck,
  GitBranch,
  Grid3x3,
  Hash,
  Highlighter,
  HelpCircle,
  ListOrdered,
  LogOut,
  Repeat,
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
  end: {
    label: "End",
    description: "End the session (screen out or complete)",
    icon: LogOut,
    color: "text-destructive",
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

/** Questions are shown with the icon of their answer type. */
const ANSWER_TYPE_ICONS: Record<AnyVariableType["type"], LucideIcon> = {
  nominal: Tag,
  ordinal: ListOrdered,
  numeric: Hash,
  scale: Grid3x3,
  annotinder: ArrowLeftRight,
  confirm: CircleCheck,
  auto: Shuffle,
  span: Highlighter,
  relation: Spline,
};

/** The icon of an item: its type's, or for a question its answer type's. */
export function itemIcon(item: TreeNode): LucideIcon {
  if ("variable" in item && item.variable) {
    if (item.variable.type === "nominal" && item.variable.multiple) return Tags;
    return ANSWER_TYPE_ICONS[item.variable.type] ?? ITEM_TYPES[item.type].icon;
  }
  return ITEM_TYPES[item.type].icon;
}
