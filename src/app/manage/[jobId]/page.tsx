"use client";
import { useCodebooks } from "@/app/api/jobs/[jobId]/codebook/query";
import { useJob } from "@/app/api/jobs/query";
import DBSelect from "@/components/Common/DBSelect";
import { useCreateCodebook } from "@/components/Forms/codebookForms";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function Job({ params }: { params: { jobId: number } }) {
  const { data: job, isLoading, isError } = useJob(params.jobId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2">
      {/* <JobUserTable jobId={params.jobId} /> */}
      <div className="max-w-xl p-3">
        <Codebooks jobId={params.jobId} />
      </div>
    </div>
  );
}

function Codebooks({ jobId }: { jobId: number }) {
  const useCodebooksProps = useCodebooks(jobId);
  const { create } = useCreateCodebook(jobId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>Codebook</Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-72">
        <DBSelect {...useCodebooksProps} nameField={"name"} jobId={jobId}>
          <Button className="h-8 w-full" variant="secondary" onClick={create}>
            Create new codebook
          </Button>
        </DBSelect>
      </PopoverContent>
    </Popover>
  );
}
