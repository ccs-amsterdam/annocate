import {
  useDeleteJobBlock,
  useJobBlockContent,
  useJobBlocksMeta,
  useUpdateJobBlockTree,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/query";
import { JobBlockTreeUpdateSchema } from "@/app/api/projects/[projectId]/jobs/[jobId]/blocks/schemas";
import { useJob } from "@/app/api/projects/[projectId]/jobs/query";
import { JobResponse, JobBlockResponse, JobBlockTreeResponse } from "@/app/types";
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
  position: JobBlockResponse["position"];
  parentId: JobBlockResponse["parentId"];
  type: JobBlockResponse["type"];
  currentId?: number;
}

export function JobBlocks({ projectId, jobId }: Props) {
  const { data: blocks, isLoading } = useJobBlocksMeta(projectId, jobId);
  const [blockForm, setBlockForm] = useState<BlockFormProps | null>(null);
  const [preview, setPreview] = useState<z.infer<typeof JobBlockTreeUpdateSchema> | null>(null);

  function header() {
    if (!blockForm) return "...";
    if (blockForm.type === "surveyPhase") return "Survey phase";
    if (blockForm.type === "annotationPhase") return "Annotation phase";
    if (blockForm.type === "surveyQuestion") return "Survey question";
    if (blockForm.type === "annotationQuestion") return "Annotation question";
    let type = "Annotation question";
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
      <div className="flex animate-slide-in-left flex-col">
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
          <CreateBlock
            newBlock
            projectId={projectId}
            jobId={jobId}
            parentId={null}
            position={99999}
            setBlockForm={setBlockForm}
          />
        </div>
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

interface CreateBlockProps {
  projectId: number;
  jobId: number;
  parentId: number | null;
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

function CreateBlock({ projectId, jobId, parentId, position, setBlockForm, newBlock }: CreateBlockProps) {
  const [open, setOpen] = useState(false);
  const { data: parent, isLoading: parentLoading } = useJobBlockContent(projectId, jobId, parentId || undefined);

  const options: JobBlockResponse["type"][] = useMemo(() => {
    if (!parent) return ["surveyPhase", "annotationPhase"];
    if (parent.type === "surveyPhase") return ["surveyQuestion"];
    if (parent.type === "annotationPhase") return ["annotationQuestion"];
    if (parent.type === "surveyQuestion") return ["surveyQuestion"];
    if (parent.type === "annotationQuestion") return ["annotationQuestion"];
    return [];
  }, [parent]);

  if (parentLoading) return "...loading";

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
            onClick={(e) => {
              if (options.length === 1) {
                setBlockForm({ projectId, jobId, parentId, position, type: options[0] });
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
                  setBlockForm({ projectId, jobId, parentId, position, type });
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
  block: JobBlockTreeResponse;
  projectId: number;
  jobId: number;
  setBlockForm: (props: BlockFormProps) => void;
}

function JobBlockItem({ block, projectId, jobId, setBlockForm }: BlockProps) {
  const { mutateAsync } = useUpdateJobBlockTree(projectId, jobId, block.id);
  const { mutateAsync: deleteBlock } = useDeleteJobBlock(projectId, jobId, block.id);
  const { data: content, isLoading: contentLoading } = useJobBlockContent(projectId, jobId, block.id);
  const router = useRouter();

  const name = contentLoading ? "...loading" : content?.name || "could not load block";
  const type = content?.type;

  return (
    <div className="flex animate-fade-in items-center gap-1">
      <div className="max-w-full overflow-hidden rounded px-3" style={{ marginLeft: `${block.level}rem` }}>
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
          onClick={() => deleteBlock()}
          onClickConfirm={{
            title: "Are you sure?",
            message: "This will delete the block. It will never return, nor forgive you",
          }}
          disabled={!!block.children}
        >
          <Trash className="h-5 w-5" />
        </Button>

        <Button
          size="icon"
          variant="ghost"
          disabled={!type}
          onClick={() => {
            if (!type) return null;
            setBlockForm({
              projectId,
              jobId,
              position: block.position,
              parentId: block.parentId,
              type: type,
              currentId: block.id,
            });
          }}
        >
          <Edit className="h-5 w-5" />
        </Button>

        <CreateBlock
          projectId={projectId}
          jobId={jobId}
          parentId={block.id}
          position={block.children + 1}
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

function AddBlockHere({ projectId, jobId, phase, parentId, position, setBlockForm }: AddBlockProps) {
  const [open, setOpen] = useState(false);

  const options: JobBlockResponse["type"][] = useMemo(() => {
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
