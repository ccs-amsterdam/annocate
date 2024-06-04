"use client";
import { UnitsTable } from "./UnitsTable";

export default function Users({ params }: { params: { projectId: number } }) {
  return (
    <div className="mx-auto mt-10 max-w-xl">
      <UnitsTable projectId={params.projectId} />
    </div>
  );
}
