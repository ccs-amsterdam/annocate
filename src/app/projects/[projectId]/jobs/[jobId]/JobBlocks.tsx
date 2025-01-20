import {
  useDeleteJobBlock,
  useJobBlockContent,
  useJobBlocksMeta,
  useUpdateJobBlockMeta,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/query";
import { JobBlockMetaUpdateSchema } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { useJob } from "@/app/api/projects/[projectId]/jobs/query";
import { Job, JobBlock, JobBlockMeta, JobBlockPosition } from "@/app/types";
import { JobBlockPreview } from "./JobBlockPreview";
import { MoveItemInArray } from "@/components/Forms/formHelpers";
import { CreateOrUpdateJobBlock } from "@/components/Forms/jobBlockForms";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { SimplePopover } from "@/components/ui/simplePopover";
import { ArrowLeft, Book, Edit, Plus, PlusIcon, Trash, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useMemo } from "react";
import { useState } from "react";
import { z } from "zod";

interface Props {
  projectId: number;
  jobId: number;
}

interface BlockFormProps {
  projectId: number;
  jobId: number;
  position: JobBlock["position"];
  parentId: JobBlock["parentId"];
  phase: JobBlock["phase"];
  type: JobBlock["type"];
  currentId?: number;
}

export function JobBlocks({ projectId, jobId }: Props) {
  const { data: blocks, isLoading } = useJobBlocksMeta(projectId, jobId);
  const [blockForm, setBlockForm] = useState<BlockFormProps | null>(null);
  const [preview, setPreview] = useState<z.infer<typeof JobBlockMetaUpdateSchema> | null>(null);

  function header() {
    if (!blockForm) return "...";
    let type = "Annotation question";
    if (blockForm.phase === "preSurvey") type = "Pre-survey question";
    if (blockForm.phase === "postSurvey") type = "Post-survey question";
    return `${type}`;
  }

  function conditionalRenderLeft() {
    if (isLoading) return <Loading />;
    if (!blocks) return <div>Job blocks not found</div>;

    if (!!blockForm)
      return (
        <div className="flex h-full w-full animate-slide-in-right flex-col gap-6 p-3">
          <CreateOrUpdateJobBlock
            {...blockForm}
            header={header()}
            currentId={blockForm.currentId}
            afterSubmit={() => setBlockForm(null)}
            setPreview={setPreview}
            onCancel={() => setBlockForm(null)}
          />
        </div>
      );
    return (
      <div className="flex animate-slide-in-left flex-col gap-6">
        <PhaseBlocks
          blocks={blocks}
          projectId={projectId}
          jobId={jobId}
          setBlockForm={setBlockForm}
          phase="preSurvey"
        />
        <PhaseBlocks blocks={blocks} projectId={projectId} jobId={jobId} setBlockForm={setBlockForm} phase="annotate" />
        <PhaseBlocks
          blocks={blocks}
          projectId={projectId}
          jobId={jobId}
          setBlockForm={setBlockForm}
          phase="postSurvey"
        />
      </div>
    );
  }

  function conditionalRenderRight() {
    return <JobBlockPreview projectId={projectId} jobId={jobId} />;
  }

  return (
    <div className="mx-auto grid w-full grid-cols-1 gap-3 md:grid-cols-[600px,1fr] md:gap-9">
      {conditionalRenderLeft()}
      {conditionalRenderRight()}
    </div>
  );
}

interface PhaseBlocksProps {
  blocks: JobBlockPosition[];
  projectId: number;
  jobId: number;
  setBlockForm: (props: BlockFormProps) => void;
  phase: "preSurvey" | "postSurvey" | "annotate";
}

function PhaseBlocks({ blocks, projectId, jobId, setBlockForm, phase }: PhaseBlocksProps) {
  let label = "Annotate";
  if (phase === "preSurvey") label = "Pre-survey";
  if (phase === "postSurvey") label = "Post-survey";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1 rounded bg-primary p-3 text-primary-foreground">
        <h4 className="whitespace-nowrap">{label}</h4>

        <AddBlockHere
          projectId={projectId}
          jobId={jobId}
          parentId={0}
          phase={phase}
          position={0}
          setBlockForm={setBlockForm}
        />
      </div>
      <div className="px-3">
        {blocks.map((block, i) => {
          if (block.phase !== phase) return null;
          return (
            <React.Fragment key={block.id}>
              {/* <AddBlockHere projectId={projectId} jobId={jobId} phase={phase} position={i} setBlockForm={setBlockForm} /> */}
              <JobBlockItem
                key={block.id}
                block={block}
                position={i}
                projectId={projectId}
                jobId={jobId}
                n={blocks.length}
                setBlockForm={setBlockForm}
              />
            </React.Fragment>
          );
        })}
      </div>
      {/* <AddBlockHere
        projectId={projectId}
        jobId={jobId}
        phase={phase}
        position={job.blocks.length}
        setBlockForm={setBlockForm}
      /> */}
    </div>
  );
}

interface BlockProps {
  block: JobBlockPosition;
  position: number;
  projectId: number;
  jobId: number;
  n: number;
  setBlockForm: (props: BlockFormProps) => void;
}

function JobBlockItem({ block, position, projectId, jobId, n, setBlockForm }: BlockProps) {
  const { mutateAsync } = useUpdateJobBlockMeta(projectId, jobId, block.id);
  const { mutateAsync: deleteBlock } = useDeleteJobBlock(projectId, jobId, block.id);
  const { data: content, isLoading: contentLoading } = useJobBlockContent(projectId, jobId, block.id);
  const router = useRouter();

  const name = contentLoading ? "...loading" : content?.name || "could not load block";
  const type = content?.type;

  return (
    <div className="flex animate-fade-in items-center gap-1">
      <MoveItemInArray
        i={position}
        n={n}
        bg={"background"}
        variant="secondary"
        move={(_, to) => {
          mutateAsync({ position: to });
        }}
      />
      <div className="max-w-full overflow-hidden rounded px-3">
        <div className="mt-1">
          <div className="grid grid-cols-[1fr] items-center gap-2">
            {/* <Book className="h-4 w-4" /> */}
            <div className="overflow-hidden text-ellipsis whitespace-nowrap">{name.replaceAll("_", " ")}</div>
          </div>
        </div>
      </div>
      <div className="ml-auto flex items-center">
        <Button
          size="icon"
          variant="ghost"
          disabled={!type}
          onClick={() => {
            if (!type) return null;
            setBlockForm({
              projectId,
              jobId,
              position,
              parentId: block.parentId,
              phase: block.phase,
              type: type,
              currentId: block.id,
            });
          }}
        >
          <Edit className="h-5 w-5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={() => deleteBlock()}
          onClickConfirm={{
            title: "Are you sure?",
            message: "This will delete the block. It will never return, nor forgive you",
          }}
        >
          <Trash className="h-5 w-5" />
        </Button>
        <AddBlockHere
          projectId={projectId}
          jobId={jobId}
          phase={block.phase}
          parentId={null}
          position={position + 1}
          setBlockForm={setBlockForm}
        />
      </div>
    </div>
  );
}

interface AddBlockProps {
  projectId: number;
  jobId: number;
  phase: "preSurvey" | "postSurvey" | "annotate";
  parentId: number | null;
  position: number;
  setBlockForm: (props: BlockFormProps) => void;
}

const typeLabel = {
  surveyQuestion: "Survey question",
  unitLayout: "Unit layout",
  annotationQuestion: "Annotation question",
};

function AddBlockHere({ projectId, jobId, phase, parentId, position, setBlockForm }: AddBlockProps) {
  const [open, setOpen] = useState(false);

  const options: JobBlock["type"][] = useMemo(() => {
    if (phase === "preSurvey") return ["surveyQuestion"];
    if (phase === "postSurvey") return ["surveyQuestion"];
    if (phase === "annotate") return ["annotationQuestion", "unitLayout"];
    return [];
  }, [phase]);

  return (
    <div className="ml-auto flex h-3 items-center gap-3">
      {/* <div className="w-full border-b-2 border-secondary/30"></div> */}
      <SimplePopover
        open={open}
        setOpen={setOpen}
        trigger={
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              if (options.length === 1) {
                setBlockForm({ projectId, jobId, parentId, position, phase, type: options[0] });
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
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
                  setBlockForm({ projectId, jobId, parentId, position, phase, type });
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
