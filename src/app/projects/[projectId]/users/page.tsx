"use client";
import { ProjectUserTable } from "./ProjectUserTable";

export default function Users({ params }: { params: { projectId: number } }) {
  return (
    <div className="mx-auto mt-10 max-w-xl">
      <ProjectUserTable projectId={params.projectId} />
    </div>
  );
}
