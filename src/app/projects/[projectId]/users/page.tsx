"use client";;
import { use } from "react";
import { ProjectUserTable } from "./ProjectUserTable";

export default function Users(props: { params: Promise<{ projectId: number }> }) {
  const params = use(props.params);
  return (
    <div className="mx-auto mt-10 max-w-xl">
      <ProjectUserTable projectId={params.projectId} />
    </div>
  );
}
