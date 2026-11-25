import { describeCondition } from "../../../codebook/conditions";
import { childrenOf, isElse } from "../../../codebook/tree";
import type { AddOption } from "./AddItemMenu";
import { useDesignTree, type DesignTreeState } from "./context";
import { itemCondition, positionLabel } from "./rowLabels";
import { getItemKey, insertableTypesAt, type TreeNode } from "./utils";

/**
 * What a row's + offers: the places below it an item can be added (after it,
 * or for a loop or condition at the top of its children), or while moving
 * the places the ticked items may go. None for a frozen design.
 */
export function useRowAddOptions(item: TreeNode): AddOption[] {
  const tree = useDesignTree();
  const options = placeOptions(tree, getItemKey(item));
  return item.type === "branch" && !tree.moving ? branchOptions(tree, item, options) : options;
}

function placeOptions(tree: DesignTreeState, key: string): AddOption[] {
  const positions = tree.readOnly ? [] : tree.addPositions(key);
  return (tree.moving ? positions.filter(tree.canMoveTo) : positions)
    .map((position) => ({
      position,
      label: positionLabel(tree.items, position),
      types: insertableTypesAt(tree.items, position),
    }))
    .filter((o) => o.types.length > 0);
}

/** A branch's +: its items ("If …"), or (none yet) its else items ("Otherwise"), then the places further out. */
function branchOptions(tree: DesignTreeState, branch: TreeNode, options: AddOption[]): AddOption[] {
  const [own, ...outer] = options;
  const condition = itemCondition(branch);
  const inside = own
    ? [{ ...own, label: `If ${condition ? describeCondition(condition) : "the condition holds"}` }]
    : [];
  const otherwise = hasElseItems(branch) ? [] : [otherwiseOption(tree, getItemKey(branch))];
  // An empty branch: "into" is its own place; "after" and further out follow
  return [...inside, ...otherwise, ...outer.filter((o) => !("into" in o.position))];
}

const hasElseItems = (branch: TreeNode) =>
  (childrenOf(branch) ?? []).some((c) => isElse(c) && (childrenOf(c) ?? []).length > 0);

/** The first of a branch's else items. */
function otherwiseOption(tree: DesignTreeState, key: string): AddOption {
  return {
    position: { into: key },
    label: "Otherwise",
    types: insertableTypesAt(tree.items, { into: key }),
    add: (type) => tree.addElse(key, type),
  };
}
