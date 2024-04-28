"use client";

import { useJobs, usePaginatedJobs } from "@/app/api/jobs/query";
import { JobsGetResponse } from "@/app/api/jobs/route";
import { Button } from "@/components/ui/button";
import { Loader } from "@/styled/Styled";
import { useMiddlecat } from "middlecat-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export default function ManageJobsGrid() {
  return (
    <div className="flex flex-auto flex-col items-center">
      <div className="">
        <h2>Manage Jobs</h2>
        <Link href="/home/manage/new" className="flex">
          <Button variant="ghost" className="mx-auto">
            Create new job
          </Button>
        </Link>
      </div>
      <SelectJob />
    </div>
  );
}

function SelectJob() {
  const { user } = useMiddlecat();
  const [query, setQuery] = useState<string>("");
  const { data, isLoading, pagination } = usePaginatedJobs(user, query);

  if (isLoading) return <Loader />;
  if (!data) return null;

  return (
    <div>
      {data.rows.map((job) => {
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
