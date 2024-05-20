"use client";
import { useJob } from "@/app/api/jobs/query";
import { JobUserTable } from "./JobUserTable";
import { CreateCodebook } from "@/components/Forms/codebookForms";
import { param } from "drizzle-orm";
import { useCodebooks } from "@/app/api/jobs/[jobId]/codebook/query";

export default function Job({ params }: { params: { jobId: number } }) {
  const { data: job, isLoading, isError } = useJob(params.jobId);

  return (
    <div className="p-3">
      <h1>Job {params.jobId}</h1>

      {/* <JobUserTable jobId={params.jobId} /> */}
      <div className="mt-10">
        <Codebooks jobId={params.jobId} />
      </div>
    </div>
  );
}

function Codebooks({ jobId }: { jobId: number }) {
  const { data, isLoading } = useCodebooks(jobId);
  console.log(data);
  return <CreateCodebook jobId={jobId} afterSubmit={() => console.log("yeej")} />;
}
