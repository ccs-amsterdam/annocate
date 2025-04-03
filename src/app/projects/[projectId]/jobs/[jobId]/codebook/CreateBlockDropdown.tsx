import { CodebookNode } from "@/app/types";
import { CodebookNodeFormProps } from "./CodebookNodes";
import { codebookItemTypeDetails, getValidChildren } from "@/functions/treeFunctions";
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

interface Props {
  codebookNodes: CodebookNode[];
  id: number | null;
  setCodebookNodeForm: (props: CodebookNodeFormProps) => void;
}

export function CreateNodeDropdown({
  codebookNodes: codebookNodes,
  id,
  setCodebookNodeForm: setCodebookNodeForm,
}: Props) {
  const [position, setPosition] = useState<number | null>(null);

  useEffect(() => {
    setPosition(null);
  }, [codebookNodes, id]);

  const codebookNode = codebookNodes.find((node) => node.id === id);
  const options = getValidChildren(codebookNode?.data.type || null);
  const positions = codebookNodes.filter((node) => node.parentId === id);

  function dropdownItems(treeType: "phase" | "group" | "leaf") {
    return options[treeType].map((option) => {
      let icon = <FolderIcon size={16} />;
      // if (treeType === "group") icon = <FolderIcon size={16} />;
      if (option === "Survey phase") icon = <ClipboardList size={16} />;
      if (option === "Annotation phase") icon = <PenTool size={16} />;
      if (option === "Annotation task") icon = <PenTool size={16} />;
      if (option === "Question task") icon = <MessageCircleQuestionIcon size={16} />;

      return (
        <DropdownMenuItem
          key={option}
          className="flex items-center gap-2"
          onClick={() =>
            setCodebookNodeForm({ type: option, parentId: codebookNode?.parentId || null, position: position ?? 99999 })
          }
        >
          {icon}
          {option}
        </DropdownMenuItem>
      );
    });
  }

  function positionSelector() {
    if (positions.length <= 1) return null;
    const triggerLabel = position === null ? "choose position" : `Position ${positions.length + 1}`;

    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex items-center gap-2">
              <ListOrdered size={16} /> {triggerLabel}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {positions.map((node, i) => (
                <DropdownMenuItem
                  key={node.id}
                  onClick={(e) => {
                    e.preventDefault();
                    setPosition(node.position);
                  }}
                  className="flex items-center gap-2 pl-0"
                >
                  <Dot className={position === i ? "" : "invisible"} />
                  {node.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  setPosition(positions.length);
                }}
                className="flex items-center gap-2 pl-0"
              >
                <Dot className={position === positions.length || position == null ? "" : "invisible"} />
                Last
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuGroup>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Plus />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Create</DropdownMenuLabel>
          {dropdownItems("phase")}
          {dropdownItems("group")}
          {dropdownItems("leaf")}
        </DropdownMenuGroup>
        {positionSelector()}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
