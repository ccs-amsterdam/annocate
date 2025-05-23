"use client";
import { use } from "react";
import { CodebookNodes } from "./CodebookNodes";
import { safeParams } from "@/functions/utils";

export default function Job(props: { params: Promise<{ projectId: string; jobId: string }> }) {
  const params = safeParams(use(props.params));

  return (
    <div className="mt-10 flex flex-col p-3 md:p-6">
      <CodebookNodes projectId={params.projectId} jobId={params.jobId} />
    </div>
  );
}
