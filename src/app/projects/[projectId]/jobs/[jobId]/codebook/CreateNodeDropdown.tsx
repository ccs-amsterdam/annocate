import { CodebookNode } from "@/app/types";
import { CodebookNodeFormProps } from "./CodebookNodes";
import { getValidChildren } from "@/functions/treeFunctions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  ClipboardList,
  Dot,
  Folder,
  FolderIcon,
  ListOrdered,
  ListPlusIcon,
  LucideFolderPlus,
  MessageCircleQuestionIcon,
  PenTool,
  Plus,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { NodeIcon } from "./NodeIcon";

interface Props {
  id: number | null;
  nodes: CodebookNode[];
  setCodebookNodeForm: (props: CodebookNodeFormProps) => void;
  disabled?: boolean;
}

export function CreateNodeDropdown({ id, nodes, setCodebookNodeForm: setCodebookNodeForm, disabled }: Props) {
  const [position, setPosition] = useState<number | null>(null);

  useEffect(() => {
    setPosition(null);
  }, [nodes, id]);

  const codebookNode = nodes.find((node) => node.id === id);
  const options = getValidChildren(codebookNode?.data.type || null);
  const positions = nodes.filter((node) => node.parentId === id);

  function dropdownItems(treeType: "phase" | "group" | "leaf") {
    return options[treeType].map((option) => {
      let icon = <FolderIcon size={16} />;
      // if (treeType === "group") icon = <FolderIcon size={16} />;

      return (
        <DropdownMenuItem
          key={option}
          className="flex items-center gap-2"
          onClick={() =>
            setCodebookNodeForm({ type: option, parentId: codebookNode?.id || null, position: position ?? 99999 })
          }
        >
          <NodeIcon type={option} />
          {option}
        </DropdownMenuItem>
      );
    });
  }

  function positionSelector() {
    if (positions.length === 0) return null;
    const triggerLabel = position === null ? "choose position" : `Position ${position + 1}`;

    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex items-center gap-2">
              <ListOrdered size={16} /> {triggerLabel}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent sideOffset={-60} avoidCollisions={false}>
              {positions.map((node, i) => (
                <DropdownMenuItem
                  key={node.id}
                  onClick={(e) => {
                    e.preventDefault();
                    setPosition(node.position);
                  }}
                  className={"relative flex h-8 pl-0 focus:bg-transparent"}
                >
                  <Dot className={position === i ? "" : "invisible"} />
                  <div className="w-3">{i + 1}</div>
                  <div className="ml-2 flex min-w-32 translate-y-4 items-center text-xs opacity-60">{node.name}</div>
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setPosition(positions.length);
                }}
                className={"relative flex h-8 pl-0 focus:bg-transparent"}
              >
                <Dot className={position === positions.length || position == null ? "" : "invisible"} />
                <div className="w-3">{positions.length + 1}</div>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <Button size="icon" className="h-8 w-8" variant="ghost">
          <Plus size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          {/* <DropdownMenuLabel>Create</DropdownMenuLabel> */}
          {dropdownItems("phase")}
          {dropdownItems("group")}
          {dropdownItems("leaf")}
        </DropdownMenuGroup>
        {positionSelector()}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
