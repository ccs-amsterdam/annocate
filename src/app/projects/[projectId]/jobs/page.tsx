"use client";
import JobsList from "./jobsList";

export default function Job({ params }: { params: { projectId: number } }) {
  return (
    <div className="mx-auto mt-10  flex max-w-xl flex-col gap-2">
      <JobsList projectId={params.projectId} />
    </div>
  );
}
