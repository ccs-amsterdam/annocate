import { Button } from "@/components/ui/button";
import { CodebookNodeRowProps } from "./CodebookNodes";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";

export function FoldButton({ node, folded, setFolded }: CodebookNodeRowProps) {
  const isPhase = node.typeDetails.treeType === "phase";
  const isGroup = node.typeDetails.treeType === "group";

  if (!isPhase && !isGroup) return null;
  const isFolded = folded.has(node.id);
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-8 w-8"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isFolded) {
          setFolded(new Set([...folded].filter((id) => id !== node.id)));
        } else {
          setFolded(new Set([...folded, node.id]));
        }
      }}
    >
      {isFolded ? (
        <div className="relative">
          <ChevronRightIcon size={18} className="opacity-70" />
          <div className="absolute -top-2 left-3 text-xs text-primary">{node.children.length}</div>
        </div>
      ) : (
        <ChevronDownIcon size={18} className="opacity-70" />
      )}
    </Button>
  );
}
