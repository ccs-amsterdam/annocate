import { useRef, useState } from "react";
import { CodebookNodeFormProps, WindowProps } from "./CodebookNodes";
import {
  CancelMoveButton,
  MoveNodeButton,
  MoveNodeInsideButton,
  useMoveableNodes,
  UseMoveProps,
} from "./MoveNodeButton";
import { Button } from "@/components/ui/button";
import { CreateNodeDropdown } from "./CreateNodeDropdown";
import { CodebookNode, SetState } from "@/app/types";
import { FoldButton } from "./FoldButton";
import { NodeIcon } from "./NodeIcon";
import { DeleteNodeButton } from "./DeleteNodeButton";
import { CornerUpLeft } from "lucide-react";

export function CodebookList({
  projectId,
  jobId,
  codebookNodeForm,
  setCodebookNodeForm,
  preview,
  changesPending,
  codebookNodes,
}: WindowProps) {
  const disabled = !!codebookNodeForm && changesPending;
  const moveProps: UseMoveProps = useMoveableNodes({ projectId, jobId, nodes: codebookNodes || [] });
  const [folded, setFolded] = useState<Set<number>>(new Set());

  function header() {
    if (moveProps.moveNode)
      return (
        <>
          <span className="text-lg">Select new position</span>
          <Button className="h-8" variant="ghost" onClick={() => moveProps.cancelMove()}>
            Cancel
          </Button>
        </>
      );
    return (
      <>
        <span className="text-lg">Codebook</span>
        <CreateNodeDropdown nodes={codebookNodes || []} id={null} setCodebookNodeForm={setCodebookNodeForm} />
      </>
    );
  }

  return (
    <div className={`relative flex w-full min-w-[400px] animate-slide-in-left flex-col gap-3`}>
      <div className="flex items-center justify-between rounded-none border-b py-1">{header()}</div>
      <div className={`${disabled ? "pointer-events-none opacity-50" : ""}`}>
        {(codebookNodes || []).map((node, i) => {
          if (node.parentPath.some((p) => folded.has(p.id))) return null;
          return (
            <CodebookNodeRow
              key={node.id}
              nodes={codebookNodes || []}
              node={node}
              projectId={projectId}
              jobId={jobId}
              codebookNodeForm={codebookNodeForm}
              setCodebookNodeForm={setCodebookNodeForm}
              globalPosition={i}
              folded={folded}
              setFolded={setFolded}
              move={moveProps}
            />
          );
        })}
      </div>
    </div>
  );
}

export interface CodebookNodeRowProps {
  nodes: CodebookNode[];
  node: CodebookNode;
  projectId: number;
  jobId: number;
  codebookNodeForm: CodebookNodeFormProps | null;
  setCodebookNodeForm: (props: CodebookNodeFormProps | null) => void;
  globalPosition: number;
  folded: Set<number>;
  setFolded: SetState<Set<number>>;
  move: UseMoveProps;
}

function CodebookNodeRow(props: CodebookNodeRowProps) {
  const { node, codebookNodeForm, setCodebookNodeForm, globalPosition, move, folded, setFolded } = props;
  const isSelected = codebookNodeForm?.currentId === node.id;
  const isMove =
    move.moveNode && (move.moveNode.id === node.id || node.parentPath.some((p) => move.moveNode?.id === p.id));
  const { here: canMoveHere, inside: canMoveInside } = move.canMove(node);
  const isPhase = node.treeType === "phase";
  const isGroup = node.treeType === "group";
  const isAnnotationPhase =
    node.data.type === "Annotation phase" || node.parentPath?.[0]?.data.type === "Annotation phase";

  const lastPosition = useRef(globalPosition);
  let transition =
    lastPosition.current === globalPosition
      ? ""
      : lastPosition.current > globalPosition
        ? "animate-in slide-in-from-bottom"
        : "animate-in slide-in-from-top";

  function header() {
    let cname = "transition-transform";
    if (canMoveHere) cname += " group-hover:translate-y-2 ";
    if (isMove) cname += " bg-foreground/30 blur-[2px]";
    if (isPhase) cname += " text-lg font-bold";
    if (isGroup) cname += "  font-normal";
    if (move.moveNode && !canMoveHere && !canMoveInside && !isMove) {
      cname += " opacity-10";
    } else {
      if (node.treeType === "leaf") cname += " font-light";
    }

    return <span className={cname}>{node.name.replaceAll("_", " ")}</span>;
  }

  function folderIndentation() {
    const level = node.parentPath.length;
    let phaseBg = "bg-secondary/40";
    if (isAnnotationPhase) phaseBg = "bg-primary/40";

    if (level === 0) return null;
    return Array.from({ length: level }).map((_, i) => {
      const roundedTop = i === level - 1 && node.position === 0 ? "rounded-t-md" : "";
      return (
        <div
          key={i}
          // className={`${i === 0 ? "ml-[0.925rem]" : "ml-3"} ${phaseBg} mr-4 h-full w-1 flex-shrink-0 ${roundedTop}`}
          className={`mx-4 w-1 ${phaseBg} h-full flex-none ${roundedTop}`}
        />
      );
    });
  }

  function buttonColor() {
    if (isSelected) return "bg-foreground/20 hover:bg-foreground/20";
    return "hover:bg-foreground/10";
  }

  const phaseIndent = isPhase && globalPosition > 0 ? "mt-4" : "";

  return (
    <div
      tabIndex={0}
      is="button"
      className={`${phaseIndent} group flex h-8 animate-fade-in items-center ${transition} group`}
    >
      {folderIndentation()}
      <FoldButton {...props} />
      <Button
        variant="ghost"
        className={`${buttonColor()} group flex h-8 w-full justify-start overflow-visible text-ellipsis whitespace-nowrap px-2 transition-none transition-transform disabled:opacity-100 disabled:hover:bg-transparent`}
        onClick={(e) => {
          if (!node.data.type) return null;
          if (move.moveNode) {
            if (canMoveHere) move.moveTo(node);
            e.stopPropagation();
          } else {
            if (isSelected) {
              setCodebookNodeForm(null);
            } else {
              setCodebookNodeForm({
                position: node.position,
                parentId: node.parentId,
                type: node.data.type,
                currentId: node.id,
              });
            }
          }
        }}
        disabled={
          (!props.move.moveNode && props.node.name === ".movePlaceholder") || (!!props.move.moveNode && !canMoveHere)
        }
        // disabled={!!props.moveNode}
      >
        <div className={"flex w-full items-center gap-3 transition-transform"}>
          <NodeIcon
            type={node.name === ".movePlaceholder" || node.treeType === "leaf" ? null : node.data.type}
            className="opacity-60"
            tailwindSize={isPhase ? 5 : 4}
          />
          {header()}
        </div>
        {canMoveHere ? <CornerUpLeft size={16} className="ml-auto" /> : null}
      </Button>

      <div className="ml-auto">
        <CodebookNodeRowButtons {...props} />
      </div>
    </div>
  );
}

function CodebookNodeRowButtons(props: CodebookNodeRowProps) {
  function createChild() {
    if (props.move.moveNode) return null;
    return <CreateNodeDropdown {...props} id={props.node.id} />;
  }

  function deleteNode() {
    if (props.move.moveNode) return null;
    return <DeleteNodeButton {...props} />;
  }

  function moveNode() {
    if (props.move.moveNode) return null;
    return <MoveNodeButton {...props} />;
  }

  function cancelMove() {
    if (!props.move.moveNode) return null;
    if (props.node.id !== props.move.moveNode.id) return null;
    return <CancelMoveButton {...props} />;
  }

  function moveNodeInside() {
    if (!props.move.moveNode) return null;
    if (props.node.id === props.move.moveNode.id) return null;
    // if (props.node.typeDetails.treeType === "leaf") return null;
    return <MoveNodeInsideButton {...props} />;
  }

  function foldButton() {
    return <FoldButton {...props} />;
  }

  if (props.node.name === ".movePlaceholder") return null;

  return (
    <div
      className={`${props.move.moveNode ? "" : "opacity-20"} text flex items-center transition-none group-focus-within:opacity-100 group-hover:opacity-100`}
    >
      {/* {foldButton()} */}
      {/* {deleteNode()} */}
      {moveNode()}
      {/* {cancelMove()} */}
      {moveNodeInside()}
      {createChild()}
    </div>
  );
}
