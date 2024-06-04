"use client";
import { useCodebooks } from "@/app/api/projects/[projectId]/codebooks/query";
import { useProject } from "@/app/api/projects/query";
import DBSelect from "@/components/Common/DBSelect";
import { useCreateEmptyCodebook } from "@/components/Forms/codebookForms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Job({ params }: { params: { projectId: number } }) {
  const { data: job, isLoading, isError } = useProject(params.projectId);

  return (
    <div className="mx-auto mt-10 flex max-w-xl flex-col gap-2 p-3">
      <Button asChild>
        <Link href={`/projects/${params.projectId}/users`}>Users</Link>
      </Button>
      <Codebooks projectId={params.projectId} />
    </div>
  );
}

function Codebooks({ projectId }: { projectId: number }) {
  const router = useRouter();
  const useCodebooksProps = useCodebooks(projectId);
  const [newName, setNewName] = useState("");
  const { create } = useCreateEmptyCodebook(projectId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>Codebooks</Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-72">
        <DBSelect
          {...useCodebooksProps}
          nameField={"name"}
          projectId={projectId}
          onSelect={(codebook) => {
            router.push(`/projects/${projectId}/codebooks/${codebook.id}`);
          }}
        >
          <div className="flex items-center gap-2">
            <Input placeholder="New codebook" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button
              disabled={!newName}
              className="ml-auto flex  w-min gap-1"
              variant="secondary"
              onClick={() => create(newName).then(({ id }) => router.push(`/projects/${projectId}/codebooks/${id}`))}
            >
              <Plus />
            </Button>
          </div>
        </DBSelect>
      </PopoverContent>
    </Popover>
  );
}
