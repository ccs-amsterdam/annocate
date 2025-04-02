import { JobBlocksResponse } from "@/app/types";
import { BlockFormProps } from "./JobBlocks";
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
  blocks: JobBlocksResponse[];
  id: number | null;
  setBlockForm: (props: BlockFormProps) => void;
}

export function CreateBlockDropdown({ blocks, id, setBlockForm }: Props) {
  const [position, setPosition] = useState<number | null>(null);

  useEffect(() => {
    setPosition(null);
  }, [blocks, id]);

  const block = blocks.find((block) => block.id === id);
  const options = getValidChildren(block?.data.type || null);
  const positions = blocks.filter((block) => block.parentId === id);

  function triggerLabel() {
    if (position === null) return "choose position";
    return `Position ${(position ?? positions.length) + 1}`;
  }

  function positionSelector() {
    if (positions.length <= 1) return null;

    return (
      <DropdownMenuGroup>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="flex items-center gap-2">
            <ListOrdered size={16} /> {triggerLabel()}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {positions.map((block, i) => (
              <DropdownMenuItem
                key={block.id}
                onClick={(e) => {
                  e.preventDefault();
                  setPosition(block.position);
                }}
                className="flex items-center gap-2 pl-0"
              >
                <Dot className={position === i ? "" : "invisible"} />
                {block.name}
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
    );
  }

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
          onClick={() => setBlockForm({ type: option, parentId: block?.parentId || null, position: position ?? 99999 })}
        >
          {icon}
          {option}
        </DropdownMenuItem>
      );
    });
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
        <DropdownMenuSeparator />
        {positionSelector()}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
