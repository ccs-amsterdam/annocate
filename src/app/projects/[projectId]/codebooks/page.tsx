"use client";;
import { use } from "react";
import { CodebooksTable } from "./CodebooksTable";

export default function Codebooks(props: { params: Promise<{ projectId: number }> }) {
  const params = use(props.params);
  return (
    <div className="mx-auto mt-10 max-w-xl">
      <CodebooksTable projectId={params.projectId} />
    </div>
  );
}
