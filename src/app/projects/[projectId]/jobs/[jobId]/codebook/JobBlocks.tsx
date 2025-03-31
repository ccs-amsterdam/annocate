import { useDeleteJobBlock, useJobBlocks } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/query";
import { JobBlocksResponse } from "@/app/types";
import { CreateOrUpdateJobBlock } from "@/components/Forms/jobBlockForms";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { SimplePopover } from "@/components/ui/simplePopover";
import { Book, Edit, PlusIcon, Trash, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z, ZodError } from "zod";
import { getValidChildren } from "@/functions/treeFunctions";
import { JobBlockPreview } from "./JobBlockPreview";

interface Props {
  projectId: number;
  jobId: number;
}

interface BlockFormProps {
  position: JobBlocksResponse["position"];
  parentId: JobBlocksResponse["parentId"];
  type: JobBlocksResponse["data"]["type"];
  currentId?: number;
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

function LeftWindow({
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
  if (isLoading || isPending) return <Loading />;
  if (!blocks) return <div>Job blocks not found</div>;

  const disabled = !!blockForm && changesPending;

  function blockPreview() {
    if (!blockForm || !changesPending) return null;
    return (
      <div className="absolute flex w-full justify-center">
        <div className="ml-auto w-full max-w-[500px] animate-slide-in-right px-3">
          <JobBlockPreview projectId={projectId} jobId={jobId} preview={preview} />
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex w-full min-w-[400px] animate-slide-in-left flex-col`}>
      <div className={`${disabled ? "pointer-events-none opacity-50" : ""}`}>
        {(blocks || []).map((block) => {
          return (
            <JobBlockItem
              key={block.id}
              block={block}
              projectId={projectId}
              jobId={jobId}
              setBlockForm={setBlockForm}
            />
          );
        })}
        <div className="mt-12">
          <CreateBlock newBlock parent={null} position={99999} setBlockForm={setBlockForm} />
        </div>
      </div>
      {blockPreview()}
    </div>
  );
}

function RightWindow({
  projectId,
  jobId,
  blockForm,
  setBlockForm,
  blocks,
  preview,
  setPreview,
  changesPending,
  setChangesPending,
}: WindowProps) {
  if (!blockForm)
    return (
      <div className="mx-auto w-full animate-slide-in-right lg:w-[450px]">
        <JobBlockPreview projectId={projectId} jobId={jobId} preview={undefined} />
      </div>
    );

  if (!blocks) return null;
  const current = blocks.find((block) => block.id === blockForm.currentId);

  return (
    <div className="flex h-full w-full animate-slide-in-left flex-col gap-6 p-3">
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
    </div>
  );
}

interface CreateBlockProps {
  parent: JobBlocksResponse | null;
  position: number;
  setBlockForm: (props: BlockFormProps) => void;
  newBlock?: boolean;
}

const typeLabel = {
  surveyQuestion: "Survey question",
  annotationQuestion: "Annotation question",
  surveyPhase: "Survey phase",
  annotationPhase: "Annotation phase",
};

function CreateBlock({ parent, position, setBlockForm, newBlock }: CreateBlockProps) {
  const [open, setOpen] = useState(false);
  const options = getValidChildren(parent?.data.type || null);
  const parentId = parent?.id || null;

  if (options.length === 0) return null;

  return (
    <div className="ml-auto flex h-3 items-center gap-3">
      {/* <div className="w-full border-b-2 border-secondary/30"></div> */}
      <SimplePopover
        open={open}
        setOpen={setOpen}
        trigger={
          <Button
            variant={newBlock ? "secondary" : "ghost"}
            size={newBlock ? "default" : "icon"}
            className="flex items-center gap-3"
            onClick={(e) => {
              if (options.length === 1) {
                setBlockForm({ parentId, position, type: options[0] });
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            {newBlock ? "Create new phase" : null}
            <PlusIcon />
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {options.map((type) => {
            return (
              <Button
                key={type}
                onClick={() => {
                  setBlockForm({ parentId, position, type });
                  setOpen(false);
                }}
              >
                {typeLabel[type]}
              </Button>
            );
          })}
        </div>
      </SimplePopover>
    </div>
  );
}

interface BlockProps {
  block: JobBlocksResponse;
  projectId: number;
  jobId: number;
  setBlockForm: (props: BlockFormProps | null) => void;
}

function JobBlockItem({ block, projectId, jobId, setBlockForm }: BlockProps) {
  const { mutateAsync: deleteBlock } = useDeleteJobBlock(projectId, jobId, block.id);
  const router = useRouter();

  const isPhase = block.data.type === "annotationPhase" || block.data.type === "surveyPhase";

  function header() {
    return block.name.replaceAll("_", " ");
  }

  function blockStyle() {
    if (block.data.type.includes("Phase")) return `${block.position > 0 ? "mt-6" : ""}   font-bold`;
    if (block.level > 0) return "";
    if (isPhase) return "";
  }

  return (
    <div
      className={`flex animate-fade-in items-center gap-1 ${blockStyle()} group cursor-pointer hover:text-primary`}
      style={{ paddingLeft: `${block.level}rem` }}
      is="button"
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
      <div className="max-w-full overflow-hidden rounded">
        <div className="mt-1">
          <div className="flex items-center px-3">{header()}</div>
        </div>
      </div>
      <div className="text ml-auto flex items-center opacity-0 group-hover:opacity-100">
        <CreateBlock parent={block} position={block.children + 1} setBlockForm={setBlockForm} />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            setBlockForm(null);
            deleteBlock();
          }}
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
  if (type === "surveyPhase") return "Survey phase";
  if (type === "annotationPhase") return "Annotation phase";
  if (type === "surveyQuestion") return "Survey question";
  if (type === "annotationQuestion") return "Annotation question";
  return type;
}
