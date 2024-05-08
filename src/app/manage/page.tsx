"use client";

import { useJobs } from "@/app/api/jobs/query";
import { CreateJobDialog } from "@/components/Forms/CreateJob";
import { Button } from "@/components/ui/button";
import { Loader } from "@/styled/Styled";
import { useMiddlecat } from "middlecat-react";
import { useState } from "react";
import { JobsGetParams } from "../api/jobs/schemas";
import CommonGetTable from "@/components/Common/CommonGetTable";

export default function Home() {
  return (
    <div className="flex flex-auto flex-col items-center">
      <div className="">
        <h2>Manage Jobs</h2>
        <CreateJobDialog>
          <Button variant="ghost" className="mx-auto">
            Create new job
          </Button>
        </CreateJobDialog>
      </div>
      <SelectJob />
    </div>
  );
}

function SelectJob() {
  const jobs = useJobs({ pageSize: 3 });

  return <CommonGetTable {...jobs} />;
}
