import { useDeleteJobBlock, useJobBlocks } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/query";
import { JobBlocksResponse } from "@/app/types";
import { CreateOrUpdateJobBlock } from "@/components/Forms/jobBlockForms";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { SimplePopover } from "@/components/ui/simplePopover";
import { Book, Edit, FolderPlusIcon, ListPlusIcon, PlusIcon, Trash, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z, ZodError } from "zod";
import { JobBlockPreview } from "./JobBlockPreview";
import { CreateBlockDropdown } from "./CreateBlockDropdown";

interface Props {
  projectId: number;
  jobId: number;
}

export interface BlockFormProps {
  position: JobBlocksResponse["position"];
  parentId: JobBlocksResponse["parentId"];
  type: JobBlocksResponse["data"]["type"];
  currentId?: number;
}

interface WindowProps {
  projectId: number;
  jobId: number;
  blockForm: BlockFormProps | null;
  setBlockForm: (props: BlockFormProps | null) => void;
  preview: JobBlocksResponse | undefined | ZodError;
  setPreview: (value: JobBlocksResponse | undefined | ZodError) => void;
  changesPending: boolean;
  setChangesPending: (value: boolean) => void;
  blocks: JobBlocksResponse[] | undefined;
  isLoading: boolean;
  isPending: boolean;
}

export function JobBlocks({ projectId, jobId }: Props) {
  const { data: blocks, isLoading, isPending } = useJobBlocks(projectId, jobId);
  const [blockForm, setBlockForm] = useState<BlockFormProps | null>(null);
  const [preview, setPreview] = useState<JobBlocksResponse | undefined | ZodError>(undefined);
  const [changesPending, setChangesPending] = useState(false);

  const windowProps: WindowProps = {
    projectId,
    jobId,
    blockForm,
    setBlockForm,
    preview,
    setPreview,
    changesPending,
    setChangesPending,
    blocks,
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
  if (!props.blocks) return <div>Job blocks not found</div>;

  return (
    <div className={`relative flex w-full min-w-[400px] flex-col animate-in slide-in-from-top`}>
      <ShowJobBlocksList {...props} />

      <div className="absolute flex w-full justify-center">
        <ShowBlockPreview {...props} />
      </div>
    </div>
  );
}

function RightWindow(props: WindowProps) {
  const blockForm = props.blockForm;
  if (!blockForm) return <ShowJobPreview {...props} />;

  return (
    <div className="flex h-full w-full flex-col gap-6 animate-in slide-in-from-right">
      <ShowJobBlockForm {...props} />
    </div>
  );
}

function ShowJobBlocksList({
  projectId,
  jobId,
  blockForm,
  setBlockForm,
  preview,
  changesPending,
  blocks,
  isLoading,
  isPending,
}: WindowProps) {
  const disabled = !!blockForm && changesPending;

  return (
    <div className={`relative flex w-full min-w-[400px] animate-slide-in-left flex-col`}>
      <div className={`${disabled ? "pointer-events-none opacity-50" : ""}`}>
        {(blocks || []).map((block) => {
          return (
            <JobBlockItem
              key={block.id}
              blocks={blocks || []}
              block={block}
              projectId={projectId}
              jobId={jobId}
              blockForm={blockForm}
              setBlockForm={setBlockForm}
            />
          );
        })}
      </div>
      <div className="flex justify-end">
        <CreateBlockDropdown blocks={blocks || []} id={null} setBlockForm={setBlockForm} />
      </div>
    </div>
  );
}

function ShowBlockPreview({ projectId, jobId, blockForm, preview, changesPending }: WindowProps) {
  if (!blockForm || !changesPending) return null;
  return (
    <div className="ml-auto w-full max-w-[500px] animate-slide-in-right px-3">
      <JobBlockPreview projectId={projectId} jobId={jobId} preview={preview} />
    </div>
  );
}

function ShowJobPreview({ projectId, jobId, blockForm, preview, changesPending }: WindowProps) {
  return (
    <div className="mx-auto w-full animate-slide-in-right lg:w-[450px]">
      <JobBlockPreview projectId={projectId} jobId={jobId} preview={undefined} />
    </div>
  );
}

function ShowJobBlockForm({
  projectId,
  jobId,
  blockForm,
  setBlockForm,
  setPreview,
  setChangesPending,
  blocks,
}: WindowProps) {
  if (!blockForm) return null;
  if (!blocks) return null;
  const current = blocks.find((block) => block.id === blockForm.currentId);

  return (
    <div className="w-[600px]">
      <CreateOrUpdateJobBlock
        key={blockForm.currentId ?? "new" + blockForm.type}
        projectId={projectId}
        jobId={jobId}
        parentId={blockForm.parentId}
        type={blockForm.type}
        position={blockForm.position}
        header={getLabel(blockForm.type)}
        current={current}
        afterSubmit={() => setBlockForm(null)}
        setPreview={setPreview}
        onCancel={() => setBlockForm(null)}
        defaultName={getDefaultName(blocks, blockForm.type)}
        setChangesPending={setChangesPending}
      />
    </div>
  );
}

interface BlockProps {
  blocks: JobBlocksResponse[];
  block: JobBlocksResponse;
  projectId: number;
  jobId: number;
  blockForm: BlockFormProps | null;
  setBlockForm: (props: BlockFormProps | null) => void;
}

function JobBlockItem({ blocks, block, projectId, jobId, blockForm, setBlockForm }: BlockProps) {
  const { mutateAsync: deleteBlock } = useDeleteJobBlock(projectId, jobId, block.id);
  const router = useRouter();

  const isPhase = block.data.type === "Annotation phase" || block.data.type === "Survey phase";

  function header() {
    return block.name.replaceAll("_", " ");
  }

  function blockStyle() {
    if (block.data.type.includes("Phase")) return `${block.position > 0 ? "mt-6" : ""}   font-bold`;
    if (block.level > 0) return "";
    if (isPhase) return "";
  }

  return (
    <div tabIndex={0} is="button" className={`flex animate-fade-in items-center gap-1 ${blockStyle()} group gap-3`}>
      <Button
        variant="ghost"
        className={`${blockForm?.currentId === block.id ? "bg-secondary text-secondary-foreground hover:bg-secondary hover:text-secondary-foreground" : "hover:bg-secondary/10"} flex h-8 w-full max-w-lg justify-start overflow-hidden text-ellipsis whitespace-nowrap px-3 transition-none`}
        onClick={() => {
          if (!block.data.type) return null;
          setBlockForm({
            position: block.position,
            parentId: block.parentId,
            type: block.data.type,
            currentId: block.id,
          });
        }}
      >
        <div style={{ paddingLeft: `${block.level}rem` }}>{header()}</div>
      </Button>
      <div className="text flex items-center opacity-20 transition-none group-focus-within:opacity-100 group-hover:opacity-100">
        <CreateBlockDropdown blocks={blocks || []} id={block.id} setBlockForm={setBlockForm} />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            setBlockForm(null);
            deleteBlock();
          }}
          className="transition-none"
          onClickConfirm={{
            title: "Are you sure?",
            message: `This will delete the block ${block.children > 0 ? "AND all it's children (!!!)" : ""}. Are you sure?`,
            enterText: block.children > 0 ? "delete" : undefined,
          }}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}

function getDefaultName(blocks: JobBlocksResponse[], type: JobBlocksResponse["data"]["type"]) {
  const nameLabel = getLabel(type).replaceAll(" ", "_");
  let name = `${nameLabel}_1`;
  for (let i = 2; i < 1000; i++) {
    if (!blocks.find((block) => block.name === name)) break;
    name = `${nameLabel}_${i}`;
  }
  return name;
}

function getLabel(type: JobBlocksResponse["data"]["type"]) {
  if (type === "Survey phase") return "Survey phase";
  if (type === "Annotation phase") return "Annotation phase";
  if (type === "Question task") return "Question task";
  return type;
}
