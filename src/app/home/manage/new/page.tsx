"use client";
import { Loader } from "@/styled/Styled";
import { Button } from "@/styled/StyledSemantic";
import { useMutation } from "@tanstack/react-query";
import axios from "axios";
import { redirect } from "next/navigation";
import { useState } from "react";
import styled from "styled-components";

async function postJob(title: string) {
  return axios.post("/api/jobs", { title });
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    mutate: createJob,
    isLoading,
    error,
  } = useMutation(postJob, {
    onSuccess: (data) => {
      redirect(`/home/manage/${data.id}`);
    },
    onError: (e) => {
      console.log("heey");
      console.error(e);
    },
  });

  function onSubmit(e) {
    e.preventDefault();
    createJob(title);
  }

  return (
    <StyledDiv>
      <Loader $active={loading} />
      <form onSubmit={onSubmit}>
        <input
          type="text"
          value={title}
          required
          minLength="3"
          maxLength="256"
          placeholder="Job title"
          onChange={(e) => setTitle(e.target.value)}
        ></input>
        <Button>Create new job</Button>
      </form>
    </StyledDiv>
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

    input {
      padding: 1rem;
      border-radius: 5px;
    }
  }
`;
