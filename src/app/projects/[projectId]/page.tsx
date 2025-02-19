"use client";

import { use, useEffect } from "react";
import JobsList from "./jobsList";
import { safeParams } from "@/functions/utils";

export default function Project(props: { params: Promise<{ projectId: string }> }) {
  const params = safeParams(use(props.params));

  return (
    <div className="mx-auto mt-10 flex max-w-xl flex-col gap-2">
      <JobsList projectId={params.projectId} />
    </div>
  );
}
