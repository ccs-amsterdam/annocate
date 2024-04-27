"use client";
import LoginRequired from "@/components/Common/LoginRequired";
import { Button } from "@/components/ui/button";
import { useMiddlecat } from "middlecat-react";
import { useState } from "react";
import { useMutateJobs } from "@/app/api/jobs/query";
import { useRouter } from "next/navigation";

export default function Home() {
  const [title, setTitle] = useState("");
  const { user, loading } = useMiddlecat();
  const router = useRouter();

  const { mutateAsync: createJob, isLoading } = useMutateJobs(user);

  function onSubmit(e) {
    e.preventDefault();
    createJob({ title }).then(() => {
      router.push("/manage");
    });
  }

  if (!loading && !user?.email) return <LoginRequired />;

  return (
    <div className="flex h-full flex-col items-center justify-center">
      <form onSubmit={onSubmit} className="relative flex flex-col gap-2">
        <input
          type="text"
          value={title}
          required
          minLength={5}
          maxLength={128}
          placeholder="Job title"
          onChange={(e) => setTitle(e.target.value)}
          className="shadow-shadow rounded border-[1px] p-3 text-black shadow-sm"
        ></input>
        <Button disabled={loading || isLoading} className={loading || isLoading ? "loading" : ""}>
          Create new job
        </Button>
      </form>
    </div>
  );
}
