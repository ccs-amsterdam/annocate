"use client";

import { useProjects } from "@/app/api/projects/query";
import DBTable from "@/components/Common/DBTable";
import { CreateProject, UpdateProject } from "@/components/Forms/projectForms";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { ProjectsResponseSchema } from "../api/projects/schemas";

export default function Projects() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mx-auto mt-10 flex w-full max-w-5xl flex-auto flex-col items-center">
      <div className="">
        <h2>Manage Projects</h2>
        <SimpleDialog
          open={open}
          setOpen={setOpen}
          header="Create new project"
          trigger={
            <Button variant="ghost" className="mx-auto mt-2 flex items-center gap-2">
              Create new project
              <Plus className="h-5 w-5" />
            </Button>
          }
        >
          <CreateProject afterSubmit={() => setOpen(false)} />
        </SimpleDialog>
      </div>
      <SelectJob />
    </div>
  );
}

const COLUMNS = ["name", "created", "creator"];

function SelectJob() {
  const jobs = useProjects();
  const router = useRouter();

  function onSelect(row: z.infer<typeof ProjectsResponseSchema>) {
    router.push(`/projects/${row.id}/jobs`);
  }

  return <DBTable className="mt-8 w-full p-3" {...jobs} onSelect={onSelect} columns={COLUMNS} />;
}
