import { useDeleteJobBlock, useJob, useUpdateJobBlock } from "@/app/api/projects/[projectId]/jobs/query";
import { JobBlock } from "@/app/types";
import { MoveItemInArray } from "@/components/Forms/formHelpers";
import { CreateOrUpdateJobBlock } from "@/components/Forms/jobBlockForms";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { SimplePopover } from "@/components/ui/simplePopover";
import { Edit, Plus, Trash } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
                setBlockForm={setBlockForm}
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
  setBlockForm: (props: BlockFormProps) => void;
}

function JobBlockItem({ block, position, projectId, jobId, n, setBlockForm }: BlockProps) {
  const { mutateAsync } = useUpdateJobBlock(projectId, jobId, block.id);
  const { mutateAsync: deleteBlock } = useDeleteJobBlock(projectId, jobId, block.id);
  const router = useRouter();

  function showDetails() {
    const s = block.n_variables > 1 ? "s" : "";
    if (block.type === "survey") {
      return `${block.n_variables} variable${s}`;
    }
    return `${block.n_variables} variable${s}, ${block.n_units || "all"} units`;
  }

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
        className="cursor-pointer rounded px-3 hover:bg-foreground/10"
        onClick={() => router.push(`/projects/${projectId}/codebooks/${block.codebookId}?blockId=${block.id}`)}
      >
        <h4 className="m-0 mt-2 leading-none">{block.codebookName}</h4>
        <span className="leading-none text-foreground/60">{showDetails()}</span>
      </div>
      <div className="ml-auto flex ">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setBlockForm({ projectId, jobId, position, type: block.type, current: block })}
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
      <div className="w-full border-b-2 border-secondary/50"></div>
      <SimplePopover
        open={open}
        setOpen={setOpen}
        header="Select block type"
        trigger={
          <Button variant="secondary" className="h-8 w-8 rounded-full text-lg">
            +
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
