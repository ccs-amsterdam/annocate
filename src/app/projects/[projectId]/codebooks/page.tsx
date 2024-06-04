"use client";
import { CodebooksTable } from "./CodebooksTable";

export default function Users({ params }: { params: { projectId: number } }) {
  return (
    <div className="mx-auto mt-10 max-w-xl">
      <CodebooksTable projectId={params.projectId} />
    </div>
  );
}
