import { Button } from "@/components/ui/button";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { CodebookNodeRowProps } from "./CodebookList";

export function FoldButton({ node, folded, setFolded }: CodebookNodeRowProps) {
  const isPhase = node.treeType === "phase";
  const isGroup = node.treeType === "group";

  if (!isPhase && !isGroup) return null;
  const isFolded = folded.has(node.id);
  return (
    <Button
      size="icon"
      variant="ghost"
      className="h-9 w-9 flex-none"
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
          <div className="absolute -top-2 left-3 text-xs text-foreground/80">{node.children.length}</div>
        </div>
      ) : (
        <ChevronDownIcon size={18} className="opacity-70" />
      )}
    </Button>
  );
}
