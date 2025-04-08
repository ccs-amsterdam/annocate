import {
  useDeleteCodebookNode,
  useCodebookNodes,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/query";
import { CodebookNode, SetState } from "@/app/types";
import { CreateOrUpdateCodebookNodes } from "@/components/Forms/codebookNodeForms";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { SimplePopover } from "@/components/ui/simplePopover";
import {
  ArrowRight,
  Book,
  ChevronDown,
  ChevronDownIcon,
  ChevronRightIcon,
  Edit,
  Ellipsis,
  FolderPlusIcon,
  Grid,
  Grip,
  GripHorizontal,
  ListPlusIcon,
  Plus,
  PlusIcon,
  Trash,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { SetStateAction, useRef, useState } from "react";
import { z, ZodError } from "zod";
import { CodebookNodePreview } from "./CodebookNodePreview";
import { CreateNodeDropdown } from "./CreateNodeDropdown";
import { DeleteNodeButton } from "./DeleteNodeButton";
import { CancelMoveButton, MoveNodeButton, MoveNodeInsideButton, useMoveableNodes } from "./MoveNodeButton";
import { NodeIcon } from "./NodeIcon";
import { FoldButton } from "./FoldButton";

interface Props {
  projectId: number;
  jobId: number;
}

export interface CodebookNodeFormProps {
  position: CodebookNode["position"];
  parentId: CodebookNode["parentId"];
  type: CodebookNode["data"]["type"];
  currentId?: number;
}

export interface CodebookNodeRowProps {
  nodes: CodebookNode[];
  node: CodebookNode;
  projectId: number;
  jobId: number;
  codebookNodeForm: CodebookNodeFormProps | null;
  setCodebookNodeForm: (props: CodebookNodeFormProps | null) => void;
  moveNode: CodebookNode | null;
  movePending: boolean;
  moveFrom: (node: CodebookNode) => void;
  moveTo: (node: { parentId: number | null; position: number }) => void;
  canMove: (node: CodebookNode) => boolean;
  cancelMove: () => void;
  globalPosition: number;
  folded: Set<number>;
  setFolded: SetState<Set<number>>;
}

interface WindowProps {
  projectId: number;
  jobId: number;
  codebookNodeForm: CodebookNodeFormProps | null;
  setCodebookNodeForm: (props: CodebookNodeFormProps | null) => void;
  preview: CodebookNode | undefined | ZodError;
  setPreview: (value: CodebookNode | undefined | ZodError) => void;
  changesPending: boolean;
  setChangesPending: (value: boolean) => void;
  codebookNodes: CodebookNode[] | undefined;
  isLoading: boolean;
  isPending: boolean;
}

export function CodebookNodes({ projectId, jobId }: Props) {
  const { data: codebookNodes, isLoading, isPending } = useCodebookNodes(projectId, jobId);
  const [CodebookNodeForm, setCodebookNodeForm] = useState<CodebookNodeFormProps | null>(null);
  const [preview, setPreview] = useState<CodebookNode | undefined | ZodError>(undefined);
  const [changesPending, setChangesPending] = useState(false);

  const windowProps: WindowProps = {
    projectId,
    jobId,
    codebookNodeForm: CodebookNodeForm,
    setCodebookNodeForm: setCodebookNodeForm,
    preview,
    setPreview,
    changesPending,
    setChangesPending,
    codebookNodes,
    isLoading,
    isPending,
  };

  return (
    <div className="mx-auto grid w-full max-w-[1600px] grid-cols-[1fr,600px] gap-9">
      <LeftWindow {...windowProps} />
      <RightWindow {...windowProps} />
    </div>
  );
}

function LeftWindow(props: WindowProps) {
  if (props.isLoading || props.isPending) return <Loading />;
  if (!props.codebookNodes) return <div>Codebook not found</div>;

  return (
    <div className={`relative flex w-full min-w-[400px] flex-col animate-in slide-in-from-top`}>
      <ShowCodebookNodesList {...props} />

      <div className="absolute flex w-full justify-center">
        <ShowCodebookNodePreview {...props} />
      </div>
    </div>
  );
}

function RightWindow(props: WindowProps) {
  const CodebookNodeForm = props.codebookNodeForm;
  if (!CodebookNodeForm) return <ShowJobPreview {...props} />;

  return (
    <div className="flex h-full w-full flex-col gap-6 animate-in slide-in-from-right">
      <ShowCodebookNodesForm {...props} />
    </div>
  );
}

function ShowCodebookNodesList({
  projectId,
  jobId,
  codebookNodeForm,
  setCodebookNodeForm,
  preview,
  changesPending,
  codebookNodes,
}: WindowProps) {
  const disabled = !!codebookNodeForm && changesPending;
  const moveProps = useMoveableNodes({ projectId, jobId, nodes: codebookNodes || [] });
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
              {...moveProps}
            />
          );
        })}
      </div>
    </div>
  );
}

function ShowCodebookNodePreview({ projectId, jobId, codebookNodeForm, preview, changesPending }: WindowProps) {
  if (!codebookNodeForm || !changesPending) return null;
  return (
    <div className="ml-auto w-full max-w-[500px] animate-slide-in-right px-3">
      <CodebookNodePreview projectId={projectId} jobId={jobId} preview={preview} />
    </div>
  );
}

function ShowJobPreview({ projectId, jobId, codebookNodeForm, preview, changesPending }: WindowProps) {
  return (
    <div className="mx-auto w-full animate-slide-in-right lg:w-[450px]">
      <CodebookNodePreview projectId={projectId} jobId={jobId} preview={undefined} />
    </div>
  );
}

function ShowCodebookNodesForm({
  projectId,
  jobId,
  codebookNodeForm,
  changesPending,
  setCodebookNodeForm,
  setPreview,
  setChangesPending,
  codebookNodes,
}: WindowProps) {
  if (!codebookNodeForm) return null;
  if (!codebookNodes) return null;
  const current = codebookNodes.find((node) => node.id === codebookNodeForm.currentId);

  return (
    <div className="w-[600px]">
      <CreateOrUpdateCodebookNodes
        key={codebookNodeForm.currentId ?? "new" + codebookNodeForm.type}
        projectId={projectId}
        jobId={jobId}
        parentId={codebookNodeForm.parentId}
        type={codebookNodeForm.type}
        position={codebookNodeForm.position}
        header={getLabel(codebookNodeForm.type)}
        current={current}
        afterSubmit={() => setCodebookNodeForm(null)}
        setPreview={setPreview}
        onCancel={() => setCodebookNodeForm(null)}
        defaultName={getDefaultName(codebookNodes, codebookNodeForm.type)}
        changesPending={changesPending}
        setChangesPending={setChangesPending}
      />
    </div>
  );
}

function CodebookNodeRow(props: CodebookNodeRowProps) {
  const { node, codebookNodeForm, setCodebookNodeForm, canMove, globalPosition, moveNode, moveTo, folded, setFolded } =
    props;
  const isSelected = codebookNodeForm?.currentId === node.id;
  const isMove = moveNode && (moveNode.id === node.id || node.parentPath.some((p) => moveNode?.id === p.id));
  const canMoveNode = moveNode && canMove(node);
  const isPhase = node.typeDetails.treeType === "phase";
  const isGroup = node.typeDetails.treeType === "group";

  const lastPosition = useRef(globalPosition);
  let transition =
    lastPosition.current === globalPosition
      ? ""
      : lastPosition.current > globalPosition
        ? "animate-in slide-in-from-bottom"
        : "animate-in slide-in-from-top";

  function header() {
    let cname = "";
    if (isMove) cname = " text-primary";
    if (isPhase) cname += " text-lg font-bold";
    if (isGroup) cname += "  ";
    if (moveNode && !canMoveNode) {
      cname += " opacity-50";
    } else {
      if (node.typeDetails.treeType === "leaf") cname += "  italic";
    }

    return <span className={cname}>{node.name.replaceAll("_", " ")}</span>;
  }

  const moveable = canMoveNode ? "MoveableNodeTrigger cursor-pointer" : "";

  function folderIndentation() {
    const level = node.parentPath.length;
    let phaseBg = "bg-secondary/40";
    if (node.parentPath?.[0]?.data.type === "Annotation phase") phaseBg = "bg-primary/40";
    const roundedTop = node.position === 0 ? "rounded-t-md" : "";
    const roundedBottom = node.position === node.parentPath.length - 1 ? "" : "";

    if (level === 0) return null;
    return Array.from({ length: level }).map((_, i) => {
      return (
        <div
          key={i}
          className={`${i === 0 ? "ml-[0.675rem]" : "ml-[0.5rem]"} ${phaseBg} mr-4 h-full w-1 flex-shrink-0 ${roundedTop} ${roundedBottom}`}
        />
      );
    });
  }

  const phaseIndent = isPhase && globalPosition > 0 ? "mt-4" : "";
  const buttonWidth = "w-full";

  return (
    <div
      tabIndex={0}
      is="button"
      className={`MoveableNode ${phaseIndent} group flex h-8 animate-fade-in items-center gap-2 ${transition} group`}
    >
      {folderIndentation()}
      <FoldButton {...props} />
      <Button
        variant="ghost"
        className={`${moveable} ${isSelected ? "bg-secondary text-secondary-foreground hover:bg-secondary hover:text-secondary-foreground" : "hover:bg-secondary/20"} h-8 ${buttonWidth} flex justify-start overflow-visible text-ellipsis whitespace-nowrap px-2 transition-none transition-transform disabled:opacity-100 disabled:hover:bg-transparent`}
        onClick={(e) => {
          if (!node.data.type) return null;
          if (moveNode) {
            if (canMoveNode) moveTo(node);
            e.stopPropagation();
          } else {
            setCodebookNodeForm({
              position: node.position,
              parentId: node.parentId,
              type: node.data.type,
              currentId: node.id,
            });
          }
        }}
        disabled={(!props.moveNode && props.node.name === ".movePlaceholder") || (!!props.moveNode && !canMoveNode)}
        // disabled={!!props.moveNode}
      >
        <div className={"MoveableLabel flex w-full items-center gap-3 transition-transform"}>
          <NodeIcon
            type={node.name === ".movePlaceholder" || node.typeDetails.treeType === "leaf" ? null : node.data.type}
            className="opacity-60"
            tailwindSize={isPhase ? 5 : 4}
          />
          {header()}
        </div>
      </Button>

      <div className="ml-auto">
        <CodebookNodeRowButtons {...props} />
      </div>
    </div>
  );
}

function CodebookNodeRowButtons(props: CodebookNodeRowProps) {
  function createChild() {
    if (props.moveNode) return null;
    if (props.node.typeDetails.treeType === "leaf") return null;
    return <CreateNodeDropdown {...props} id={props.node.id} />;
  }

  function deleteNode() {
    if (props.moveNode) return null;
    return <DeleteNodeButton {...props} />;
  }

  function moveNode() {
    if (props.moveNode) return null;
    return <MoveNodeButton {...props} />;
  }

  function cancelMove() {
    if (!props.moveNode) return null;
    if (props.node.id !== props.moveNode.id) return null;
    return <CancelMoveButton {...props} />;
  }

  function moveNodeInside() {
    if (!props.moveNode) return null;
    if (props.node.id === props.moveNode.id) return null;
    if (props.node.typeDetails.treeType === "leaf") return null;
    return <MoveNodeInsideButton {...props} />;
  }

  function foldButton() {
    return <FoldButton {...props} />;
  }

  if (props.node.name === ".movePlaceholder") return null;

  return (
    <div
      className={`${props.moveNode ? "" : "opacity-20"} text flex items-center transition-none group-focus-within:opacity-100 group-hover:opacity-100`}
    >
      {createChild()}
      {/* {foldButton()} */}
      {/* {deleteNode()} */}
      {moveNode()}
      {cancelMove()}
      {moveNodeInside()}
    </div>
  );
}

function getDefaultName(nodes: CodebookNode[], type: CodebookNode["data"]["type"]) {
  const nameLabel = getLabel(type).replaceAll(" ", "_");
  let name = `${nameLabel}_1`;
  for (let i = 2; i < 1000; i++) {
    if (!nodes.find((block) => block.name === name)) break;
    name = `${nameLabel}_${i}`;
  }
  return name;
}

function getLabel(type: CodebookNode["data"]["type"]) {
  if (type === "Survey phase") return "Survey phase";
  if (type === "Annotation phase") return "Annotation phase";
  if (type === "Question") return "Question";
  return type;
}
