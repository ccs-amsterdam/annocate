"use client";
import { useJob } from "@/app/api/jobs/query";
import { JobUserTable } from "./JobUserTable";

export default function Job({ params }: { params: { jobId: number } }) {
  const { data: job, isLoading, isError } = useJob(params.jobId);

  return (
    <div>
      <h1>Job {params.jobId}</h1>

      <JobUserTable jobId={params.jobId} />
    </div>
  );
}