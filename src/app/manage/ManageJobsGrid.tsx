"use client";

import { usePaginatedJobs } from "@/app/api/jobs/query";
import { CreateJobDialog } from "@/components/Forms/CreateJob";
import { Button } from "@/components/ui/button";
import { Loader } from "@/styled/Styled";
import { useMiddlecat } from "middlecat-react";
import { useState } from "react";

export default function ManageJobsGrid() {
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
  const { user } = useMiddlecat();
  const [query, setQuery] = useState<string>("");
  const { data, isLoading, pagination } = usePaginatedJobs(query);

  if (isLoading) return <Loader />;
  if (!data?.rows) return null;

  return (
    <div>
      {data.rows.map((job: any) => {
        return (
          <div key={job.id}>
            <h2>{job.name}</h2>
            <p>{job.createdAt}</p>
          </div>
        );
      })}
    </div>
  );
}
