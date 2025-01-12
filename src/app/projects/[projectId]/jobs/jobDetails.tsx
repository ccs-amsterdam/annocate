import { useDeleteJobBlock, useJob, useUpdateJobBlock } from "@/app/api/projects/[projectId]/jobs/query";
import { Job, JobBlockMeta } from "@/app/types";
import { MoveItemInArray } from "@/components/Forms/formHelpers";
import { CreateOrUpdateJobBlock } from "@/components/Forms/jobBlockForms";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { SimplePopover } from "@/components/ui/simplePopover";
import { Book, Edit, Plus, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React from "react";
import { useState } from "react";

interface Props {
  projectId: number;
  jobId: number;
}

interface BlockFormProps {
  projectId: number;
  jobId: number;
  position: number;
  phase: "preSurvey" | "postSurvey" | "annotate";
  current?: JobBlockMeta;
}

export function JobDetails({ projectId, jobId }: Props) {
  const { data: job, isLoading } = useJob(projectId, jobId);
  const [blockForm, setBlockForm] = useState<BlockFormProps | null>(null);

  if (isLoading) return <Loading />;
  if (!job) return <div>Could not load Job</div>;

  function dialogHeader() {
    if (!blockForm) return "...";
    const what = blockForm.current ? "Update" : "Add";
    let type = "Annotate";
    if (blockForm.phase === "preSurvey") type = "Pre-survey";
    if (blockForm.phase === "postSurvey") type = "Post-survey";
    return `${what} ${type}`;
  }

  return (
    <div>
      <div></div>
      <PhaseBlocks job={job} projectId={projectId} jobId={jobId} setBlockForm={setBlockForm} phase="preSurvey" />
      <PhaseBlocks job={job} projectId={projectId} jobId={jobId} setBlockForm={setBlockForm} phase="annotate" />
      <PhaseBlocks job={job} projectId={projectId} jobId={jobId} setBlockForm={setBlockForm} phase="postSurvey" />
      <SimpleDialog
        className="max-h-full"
        header={dialogHeader()}
        open={!!blockForm}
        setOpen={(open) => !open && setBlockForm(null)}
      >
        {blockForm ? (
          <CreateOrUpdateJobBlock
            {...blockForm}
            currentId={blockForm.current?.id}
            afterSubmit={() => setBlockForm(null)}
          />
        ) : null}
      </SimpleDialog>
    </div>
  );
}

interface PhaseBlocksProps {
  job: Job;
  projectId: number;
  jobId: number;
  setBlockForm: (props: BlockFormProps) => void;
  phase: "preSurvey" | "postSurvey" | "annotate";
}

function PhaseBlocks({ job, projectId, jobId, setBlockForm, phase }: PhaseBlocksProps) {
  let label = "Annotate";
  if (phase === "preSurvey") label = "Pre-survey";
  if (phase === "postSurvey") label = "Post-survey";

  return (
    <div>
      <h4>{label}</h4>
      {job.blocks.map((block, i) => {
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
              n={job.blocks.length}
              setBlockForm={setBlockForm}
            />
          </React.Fragment>
        );
      })}
      <AddBlockHere
        projectId={projectId}
        jobId={jobId}
        phase={phase}
        position={job.blocks.length}
        setBlockForm={setBlockForm}
      />
    </div>
  );
}

interface BlockProps {
  block: JobBlockMeta;
  position: number;
  projectId: number;
  jobId: number;
  n: number;
  setBlockForm: (props: BlockFormProps) => void;
}

function JobBlockItem({ block, position, projectId, jobId, n, setBlockForm }: BlockProps) {
  const { mutateAsync } = useUpdateJobBlock(projectId, jobId, block.id);
  const { mutateAsync: deleteBlock } = useDeleteJobBlock(projectId, jobId, block.id);
  const router = useRouter();

  return (
    <div className="flex animate-fade-in items-center gap-3 pr-16">
      <MoveItemInArray
        i={position}
        n={n}
        bg={"background"}
        variant="secondary"
        move={(_, to) => {
          mutateAsync({ position: to });
        }}
      />
      <div
        role="button"
        tabIndex={0}
        className="max-w-full cursor-pointer overflow-hidden rounded px-3 hover:bg-foreground/10"
        onClick={() => router.push(`/projects/${projectId}/jobs/${jobId}/design?blockId=${block.id}`)}
      >
        <div className="mt-1 leading-5">
          <div className="grid grid-cols-[15px,1fr] items-center gap-2">
            <Book className="h-4 w-4" />
            <div className="overflow-hidden text-ellipsis whitespace-nowrap">{block.codebookName}</div>
          </div>
        </div>
      </div>
      <div className="ml-auto flex">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setBlockForm({ projectId, jobId, position, phase: block.phase, current: block })}
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
      </div>
    </div>
  );
}

interface AddBlockProps {
  projectId: number;
  jobId: number;
  phase: "preSurvey" | "postSurvey" | "annotate";
  position: number;
  setBlockForm: (props: BlockFormProps) => void;
}

function AddBlockHere({ projectId, jobId, phase, position, setBlockForm }: AddBlockProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-3 items-center gap-3">
      <div className="w-full border-b-2 border-secondary/50"></div>
      <Button
        variant="outline"
        className="h-6 w-6 rounded-full border-secondary text-lg text-secondary"
        onClick={() => {
          setBlockForm({ projectId, jobId, position, phase });
        }}
      >
        +
      </Button>
    </div>
  );
}
