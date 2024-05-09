"use client";

import { useJobs } from "@/app/api/jobs/query";
import CommonGetTable from "@/components/Common/CommonGetTable";
import { CreateJobDialog } from "@/components/Forms/CreateJob";
import { Button } from "@/components/ui/button";
import { JobsGetResponse } from "../api/jobs/schemas";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-auto flex-col items-center">
      <div className="">
        <h2>Manage Jobs</h2>
        <CreateJobDialog>
          <Button variant="ghost" className="mx-auto mt-2 flex items-center gap-2 ">
            Create new job
            <Plus className="h-5 w-5" />
          </Button>
        </CreateJobDialog>
      </div>
      <SelectJob />
    </div>
  );
}

function SelectJob() {
  const jobs = useJobs();
  const router = useRouter();

  function onSelect(row: JobsGetResponse) {
    router.push(`/manage/${row.id}`);
  }

  return <CommonGetTable className="mt-8 w-full p-3" {...jobs} onSelect={onSelect} />;
}
