import {
  useDeleteCodebookNode,
  useCodebookNodes,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/query";
import { CodebookNode } from "@/app/types";
import { CreateOrUpdateCodebookNodes } from "@/components/Forms/jobBlockForms";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { SimplePopover } from "@/components/ui/simplePopover";
import { Book, Edit, FolderPlusIcon, ListPlusIcon, PlusIcon, Trash, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z, ZodError } from "zod";
import { CodebookNodePreview } from "./CodebookNodePreview";
import { CreateNodeDropdown } from "./CreateBlockDropdown";

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
  setCodebookNodeForm: setCodebookNodeForm,
  preview,
  changesPending,
  codebookNodes: codebookNodes,
  isLoading,
  isPending,
}: WindowProps) {
  const disabled = !!codebookNodeForm && changesPending;

  return (
    <div className={`relative flex w-full min-w-[400px] animate-slide-in-left flex-col`}>
      <div className={`${disabled ? "pointer-events-none opacity-50" : ""}`}>
        {(codebookNodes || []).map((node) => {
          return (
            <CodebookNodeRow
              key={node.id}
              nodes={codebookNodes || []}
              node={node}
              projectId={projectId}
              jobId={jobId}
              codebookNodeForm={codebookNodeForm}
              setCodebookNodeForm={setCodebookNodeForm}
            />
          );
        })}
      </div>
      <div className="flex justify-end">
        <CreateNodeDropdown codebookNodes={codebookNodes || []} id={null} setCodebookNodeForm={setCodebookNodeForm} />
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
        setChangesPending={setChangesPending}
      />
    </div>
  );
}

interface CodebookNodeProps {
  nodes: CodebookNode[];
  node: CodebookNode;
  projectId: number;
  jobId: number;
  codebookNodeForm: CodebookNodeFormProps | null;
  setCodebookNodeForm: (props: CodebookNodeFormProps | null) => void;
}

function CodebookNodeRow({ nodes, node, projectId, jobId, codebookNodeForm, setCodebookNodeForm }: CodebookNodeProps) {
  const { mutateAsync: deleteCodebookNode } = useDeleteCodebookNode(projectId, jobId, node.id);
  const router = useRouter();

  const isPhase = node.data.type === "Annotation phase" || node.data.type === "Survey phase";

  function header() {
    return node.name.replaceAll("_", " ");
  }

  function codebookNodeStyle() {
    if (node.data.type.includes("Phase")) return `${node.position > 0 ? "mt-6" : ""}   font-bold`;
    if (node.level > 0) return "";
    if (isPhase) return "";
  }

  return (
    <div
      tabIndex={0}
      is="button"
      className={`flex animate-fade-in items-center gap-1 ${codebookNodeStyle()} group gap-3`}
    >
      <Button
        variant="ghost"
        className={`${codebookNodeForm?.currentId === node.id ? "bg-secondary text-secondary-foreground hover:bg-secondary hover:text-secondary-foreground" : "hover:bg-secondary/10"} flex h-8 w-full max-w-lg justify-start overflow-hidden text-ellipsis whitespace-nowrap px-3 transition-none`}
        onClick={() => {
          if (!node.data.type) return null;
          setCodebookNodeForm({
            position: node.position,
            parentId: node.parentId,
            type: node.data.type,
            currentId: node.id,
          });
        }}
      >
        <div style={{ paddingLeft: `${node.level}rem` }}>{header()}</div>
      </Button>
      <div className="text flex items-center opacity-20 transition-none group-focus-within:opacity-100 group-hover:opacity-100">
        <CreateNodeDropdown codebookNodes={nodes || []} id={node.id} setCodebookNodeForm={setCodebookNodeForm} />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            setCodebookNodeForm(null);
            deleteCodebookNode();
          }}
          className="transition-none"
          onClickConfirm={{
            title: "Are you sure?",
            message: `This will delete the codebook item ${node.children > 0 ? "AND all it's children (!!!)" : ""}. Are you sure?`,
            enterText: node.children > 0 ? "delete" : undefined,
          }}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
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
  if (type === "Question task") return "Question task";
  return type;
}
