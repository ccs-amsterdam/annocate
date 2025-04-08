import { Button } from "@/components/ui/button";
import {
  FolderInput,
  Move,
  X,
  ArrowLeftFromLine,
  ArrowRight,
  ArrowLeft,
  GripHorizontal,
  GripVertical,
  Grip,
  Undo,
  Undo2Icon,
  FolderPlus,
} from "lucide-react";
import { CodebookNodeRowProps } from "./CodebookNodes";
import {
  useDeleteCodebookNode,
  useUpdateCodebookNode,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/query";
import { isValidParent } from "@/functions/treeFunctions";
import { useMemo, useState } from "react";
import { CodebookNode } from "@/app/types";

interface Props {
  projectId: number;
  jobId: number;
  nodes: CodebookNode[];
}

export function useMoveableNodes({ projectId, jobId, nodes }: Props) {
  const [moveNode, setMoveNode] = useState<CodebookNode | null>(null);
  const [movePending, setMovePending] = useState(false);
  const { mutateAsync: updateAsync } = useUpdateCodebookNode(projectId, jobId, moveNode?.id || -1);

  function moveFrom(node: CodebookNode) {
    setMoveNode(node);
  }

  function moveTo({ parentId, position }: { parentId: number | null; position: number }) {
    setMovePending(true);
    updateAsync({ parentId, position })
      .then(() => setMoveNode(null))
      .finally(() => setMovePending(false));
  }

  function canMove(node: CodebookNode) {
    const parent = nodes.find((n) => n.id === node.parentId);

    if (!moveNode) return false;
    if (!isValidParent(moveNode.data.type, parent?.data.type || null)) return false;
    if (node.id === moveNode.id) return false;
    if (node.parentId === moveNode.parentId && node.position === moveNode.position + 1) return false;
    if (node.parentPath.some((p) => moveNode.id === p.id)) return false;

    return true;
  }

  function cancelMove() {
    setMoveNode(null);
  }

  return { moveNode, movePending, moveFrom, moveTo, canMove, cancelMove };
}

export function MoveNodeButton(props: CodebookNodeRowProps) {
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => {
        props.moveFrom(props.node);
        props.setCodebookNodeForm(null);
      }}
      className="h-8 w-8 transition-none"
    >
      <Grip size={16} />
    </Button>
  );
}

export function CancelMoveButton(props: CodebookNodeRowProps) {
  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => {
        props.cancelMove();
      }}
      className="h-8 w-8 transition-none"
    >
      <Undo2Icon size={16} />
    </Button>
  );
}

export function MoveNodeInsideButton(props: CodebookNodeRowProps) {
  if (!props.moveNode) return null;
  const valid = isValidParent(props.moveNode.data.type, props.node.data.type);

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => {
        props.moveTo({ parentId: props.node.id, position: 99999 });
      }}
      onMouseOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="MoveableExclude h-8 w-8 transition-none"
      disabled={!valid}
    >
      <FolderPlus size={16} />
    </Button>
  );
}
