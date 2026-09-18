"use client";
import { use } from "react";
import { ProjectUserTable } from "./ProjectUserTable";
import { safeParams } from "@/functions/utils";

export default function Users(props: { params: Promise<{ projectId: string }> }) {
  const params = safeParams(use(props.params));
  return (
    <div className="mx-auto mt-10 max-w-xl">
      <ProjectUserTable projectId={params.projectId} />
    </div>
  );
}
