import { useCreateJobBlock, useJob } from "@/app/api/projects/[projectId]/jobs/query";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/ui/loader";
import { Separator } from "@/components/ui/separator";
import { Plus } from "lucide-react";

interface Props {
  projectId: number;
  jobId: number;
}

export function JobDetails({ projectId, jobId }: Props) {
  const { data: job, isLoading } = useJob(projectId, jobId);

  if (isLoading) return <Loading />;
  if (!job) return <div>Could not load Job</div>;
  console.log(job);

  return (
    <div>
      <div></div>
      <div>
        {job.blocks.map((block) => {
          return (
            <div key={block.id}>
              <div>{block.type}</div>
              <div>{block.codebookName}</div>
            </div>
          );
        })}
      </div>
      <AddBlockHere projectId={projectId} jobId={jobId} position={job.blocks.length} />
    </div>
  );
}

interface AddBlockProps {
  projectId: number;
  jobId: number;
  position: number;
}

function AddBlockHere({ projectId, jobId, position }: AddBlockProps) {
  const { mutateAsync } = useCreateJobBlock(projectId, jobId);

  return (
    <div className="flex items-center gap-3">
      <div className="w-full border-b-2 border-secondary"></div>
      <Button variant="secondary" className="rounded-full">
        <Plus className="h-5 w-5" />
      </Button>
    </div>
  );
}
