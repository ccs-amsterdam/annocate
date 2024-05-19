"use client";
import { useJob } from "@/app/api/jobs/query";
import { JobUserTable } from "./JobUserTable";
import { CreateCodebook } from "@/components/Forms/codebookForms";

export default function Job({ params }: { params: { jobId: number } }) {
  const { data: job, isLoading, isError } = useJob(params.jobId);

  return (
    <div className="p-3">
      <h1>Job {params.jobId}</h1>

      {/* <JobUserTable jobId={params.jobId} /> */}
      <div className="mt-10">
        <CreateCodebook jobId={params.jobId} afterSubmit={() => console.log("yeej")} />
      </div>
    </div>
  );
}
