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
  ArrowDownNarrowWide,
  ArrowBigDownDashIcon,
  CornerRightDown,
  FolderDown,
} from "lucide-react";
import {
  useDeleteCodebookNode,
  useUpdateCodebookNode,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/query";
import { isValidParent } from "@/functions/treeFunctions";
import { useMemo, useState } from "react";
import { CodebookNode } from "@/app/types";
import { CodebookNodeRowProps } from "./CodebookList";

interface Props {
  projectId: number;
  jobId: number;
  nodes: CodebookNode[];
}

export interface UseMoveProps {
  moveNode: CodebookNode | null;
  movePending: boolean;
  moveFrom: (node: CodebookNode) => void;
  moveTo: ({ parentId, position }: { parentId: number | null; position: number }) => void;
  canMove: (node: CodebookNode) => { here: boolean; inside: boolean };
  cancelMove: () => void;
}

export function useMoveableNodes({ projectId, jobId, nodes }: Props): UseMoveProps {
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
    if (!moveNode || moveNode.id === node.id) return { here: false, inside: false };

    let inside = isValidParent(moveNode.data.type, node.data.type);

    let here = true;
    const parent = nodes.find((n) => n.id === node.parentId);
    if (!isValidParent(moveNode.data.type, parent?.data.type || null)) here = false;
    if (node.parentId === moveNode.parentId && node.position === moveNode.position + 1) here = false;
    if (node.parentPath.some((p) => moveNode.id === p.id)) here = false;

    return { here, inside };
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
        props.move.moveFrom(props.node);
        props.setCodebookNodeForm(null);
      }}
      className="h-8 w-8 transition-none hover:bg-secondary/20"
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
        props.move.cancelMove();
      }}
      className="h-8 w-8 transition-none hover:bg-secondary/20"
    >
      <Undo2Icon size={16} />
    </Button>
  );
}

export function MoveNodeInsideButton(props: CodebookNodeRowProps) {
  if (!props.move.moveNode) return null;
  const valid = isValidParent(props.move.moveNode.data.type, props.node.data.type);

  return (
    <Button
      size="icon"
      variant="ghost"
      onClick={() => {
        props.move.moveTo({ parentId: props.node.id, position: 99999 });
      }}
      onMouseOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`MoveableExclude h-8 w-8 transition-none hover:bg-secondary/20 disabled:opacity-0`}
      disabled={!valid}
    >
      <FolderDown size={16} />
    </Button>
  );
}
