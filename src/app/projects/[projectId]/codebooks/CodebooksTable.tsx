import { useCodebooks } from "@/app/api/projects/[projectId]/codebooks/query";
import { CodebooksResponseSchema } from "@/app/api/projects/[projectId]/codebooks/schemas";
import DBTable from "@/components/Common/DBTable";
import { useCreateEmptyCodebook } from "@/components/Forms/codebookForms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

interface Props {
  projectId: number;
}

const COLUMNS = ["name", "created"];

export function CodebooksTable({ projectId }: Props) {
  const useCodebooksProps = useCodebooks(projectId);
  const router = useRouter();

  function onSelect(row: z.infer<typeof CodebooksResponseSchema>) {
    router.push(`/projects/${projectId}/codebooks/${row.id}`);
  }

  return (
    <div>
      <CreateCodebookButton projectId={projectId} />
      <div className="mt-8 w-full p-3">
        <DBTable {...useCodebooksProps} onSelect={onSelect} columns={COLUMNS} />
      </div>
    </div>
  );
}

function CreateCodebookButton({ projectId: projectId }: Props) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const router = useRouter();
  const { create } = useCreateEmptyCodebook(projectId);

  return (
    <SimpleDialog
      open={open}
      setOpen={setOpen}
      header="Create new codebook"
      trigger={
        <Button variant="ghost" className="mx-auto mt-2 flex items-center gap-2 ">
          Create new codedbook
          <Plus className="h-5 w-5" />
        </Button>
      }
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          create(newName).then(({ id }) => router.push(`/projects/${projectId}/codebooks/${id}`));
        }}
      >
        <Input placeholder="New codebook" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <Button disabled={!newName} className="ml-auto flex  w-min gap-1" variant="secondary">
          <Plus />
        </Button>
      </form>
    </SimpleDialog>
  );
}
