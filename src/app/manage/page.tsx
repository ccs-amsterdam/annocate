"use client";

import { useJobs } from "@/app/api/jobs/query";
import DBTable from "@/components/Common/DBTable";
import { CreateJob, UpdateJob } from "@/components/Forms/jobForms";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/simpleDialog";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { JobsResponseSchema } from "../api/jobs/schemas";

export default function Home() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto mt-10 flex w-full max-w-5xl flex-auto flex-col items-center">
      <div className="">
        <h2>Manage Jobs</h2>
        <SimpleDialog
          open={open}
          setOpen={setOpen}
          trigger={
            <Button variant="ghost" className="mx-auto mt-2 flex items-center gap-2 ">
              Create new job
              <Plus className="h-5 w-5" />
            </Button>
          }
        >
          <CreateJob afterSubmit={() => setOpen(false)} />
        </SimpleDialog>
      </div>
      <SelectJob />
    </div>
  );
}

const COLUMNS = ["name", "created", "creator"];

function SelectJob() {
  const jobs = useJobs();
  const router = useRouter();

  function onSelect(row: z.infer<typeof JobsResponseSchema>) {
    router.push(`/manage/${row.id}`);
  }

  return <DBTable className="mt-8 w-full p-3" {...jobs} onSelect={onSelect} columns={COLUMNS} />;
}
