"use client";

import { useCreateJob, useUpdateJob } from "@/app/api/projects/[projectId]/jobs/query";
import { JobCreateSchema, JobsResponseSchema, JobUpdateSchema } from "@/app/api/projects/[projectId]/jobs/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import { TextFormField } from "./formHelpers";

type JobCreate = z.infer<typeof JobCreateSchema>;
type JobUpdate = z.infer<typeof JobUpdateSchema>;

interface CreatJobProps {
  projectId: number;
  afterSubmit: () => void;
}
interface UpdateJobProps {
  projectId: number;
  current: z.infer<typeof JobsResponseSchema>;
  afterSubmit: () => void;
}

export function CreateJob({ projectId, afterSubmit }: CreatJobProps) {
  const { mutateAsync } = useCreateJob(projectId);
  const form = useForm<JobCreate>({
    resolver: zodResolver(JobCreateSchema),
    defaultValues: { name: "" },
  });

  function onSubmit(values: JobCreate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const shape = JobCreateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <Button type="submit">Create Job</Button>
      </form>
    </Form>
  );
}

export function UpdateJob({ projectId, current, afterSubmit }: UpdateJobProps) {
  const { mutateAsync } = useUpdateJob(projectId, current.id);
  const form = useForm<JobUpdate>({
    resolver: zodResolver(JobUpdateSchema),
    defaultValues: {
      name: "",
    },
  });

  function onSubmit(values: JobUpdate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const shape = JobUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <Button type="submit">Create Job</Button>
      </form>
    </Form>
  );
}
