"use client";;
import { use } from "react";
import JobsList from "./jobsList";

export default function Job(props: { params: Promise<{ projectId: number }> }) {
  const params = use(props.params);
  return (
    <div className="mx-auto mt-10  flex max-w-xl flex-col gap-2">
      <JobsList projectId={params.projectId} />
    </div>
  );
}
