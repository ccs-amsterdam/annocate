"use client";
import LoginRequired from "@/components/Common/LoginRequired";
import { postJob } from "@/query/jobs";
import { Loader } from "@/styled/Styled";
import { Button } from "@/styled/StyledSemantic";
import { useMutation } from "@tanstack/react-query";
import { useMiddlecat } from "middlecat-react";
import { redirect } from "next/navigation";
import { useState } from "react";
import styled from "styled-components";

export default function Home() {
  const [title, setTitle] = useState("");
  const { user, loading } = useMiddlecat();

  const { mutate: createJob, isLoading } = useMutation(postJob, {
    onSuccess: (data) => {
      redirect(`/home/manage/${data.id}`);
    },
    onError: (e) => {
      console.error(e);
    },
  });

  function onSubmit(e) {
    e.preventDefault();
    createJob({ user, title });
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
          className="rounded border-[1px] p-3 text-black shadow-sm shadow-shadow"
        ></input>
        <Button $primary disabled={loading || isLoading} className={loading || isLoading ? "loading" : ""}>
          Create new job
        </Button>
      </form>
    </div>
  );
}

const StyledDiv = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;

  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
`;
