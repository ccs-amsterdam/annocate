import { useJob, useUpdateJobBlock } from "@/app/api/projects/[projectId]/jobs/query";
import { JobBlock } from "@/app/types";
import { MoveItemInArray } from "@/components/Forms/formHelpers";
import { CreateOrUpdateJobBlock } from "@/components/Forms/jobBlockForms";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { SimplePopover } from "@/components/ui/simplePopover";
import { Plus } from "lucide-react";
import { useState } from "react";

interface Props {
  projectId: number;
  jobId: number;
}

interface BlockFormProps {
  projectId: number;
  jobId: number;
  position: number;
  type: "survey" | "annotation";
  current?: JobBlock;
}

export function JobDetails({ projectId, jobId }: Props) {
  const { data: job, isLoading } = useJob(projectId, jobId);
  const [blockForm, setBlockForm] = useState<BlockFormProps | null>(null);

  if (isLoading) return <Loading />;
  if (!job) return <div>Could not load Job</div>;

  function dialogHeader() {
    if (!blockForm) return "...";
    const what = blockForm.current ? "Update" : "Add";
    const type = blockForm.type === "survey" ? "survey" : "annotation task";
    return `${what} ${type}`;
  }

  return (
    <div>
      <div></div>
      <div>
        {job.blocks.map((block, i) => {
          return (
            <>
              <AddBlockHere projectId={projectId} jobId={jobId} position={i} setBlockForm={setBlockForm} />
              <JobBlockItem
                key={block.id}
                block={block}
                position={i}
                projectId={projectId}
                jobId={jobId}
                n={job.blocks.length}
              />
            </>
          );
        })}
        <AddBlockHere projectId={projectId} jobId={jobId} position={job.blocks.length} setBlockForm={setBlockForm} />
      </div>
      <SimpleDialog
        className="max-h-full"
        header={dialogHeader()}
        open={!!blockForm}
        setOpen={(open) => !open && setBlockForm(null)}
      >
        {blockForm ? <CreateOrUpdateJobBlock {...blockForm} afterSubmit={() => setBlockForm(null)} /> : null}
      </SimpleDialog>
    </div>
  );
}

interface BlockProps {
  block: JobBlock;
  position: number;
  projectId: number;
  jobId: number;
  n: number;
}

function JobBlockItem({ block, position, projectId, jobId, n }: BlockProps) {
  const { mutateAsync } = useUpdateJobBlock(projectId, jobId, block.id);

  return (
    <div className="flex animate-fade-in gap-3 pr-16">
      <MoveItemInArray
        i={position}
        n={n}
        bg={"background"}
        variant="secondary"
        move={(_, to) => {
          mutateAsync({ position: to });
        }}
      />
      <div>{block.type}</div>
      <div className="ml-auto">{block.codebookName}</div>
    </div>
  );
}

interface AddBlockProps {
  projectId: number;
  jobId: number;
  position: number;
  setBlockForm: (props: BlockFormProps) => void;
}

function AddBlockHere({ projectId, jobId, position, setBlockForm }: AddBlockProps) {
  const [open, setOpen] = useState(false);

  function onSelect(type: "survey" | "annotation") {
    setBlockForm({ projectId, jobId, position, type });
    setOpen(false);
  }

  return (
    <div className="flex items-center gap-3">
      <div className="w-full border-b-2 border-secondary"></div>
      <SimplePopover
        open={open}
        setOpen={setOpen}
        header="Select block type"
        trigger={
          <Button variant="secondary" size="icon" className="rounded-full p-3">
            <Plus className="h-5 w-4" />
          </Button>
        }
      >
        <div
          className="flex flex-col
        gap-2"
        >
          <Button variant="secondary" onClick={() => onSelect("survey")}>
            Survey
          </Button>
          <Button variant="secondary" onClick={() => onSelect("annotation")}>
            Annotation task
          </Button>
        </div>
      </SimplePopover>
    </div>
  );
}
