"use client";

import { useUpdateJob, useCreateJob } from "@/app/api/jobs/query";
import { JobsUpdateSchema, JobsResponseSchema } from "@/app/api/jobs/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Form } from "../ui/form";
import { TextFormField } from "./formHelpers";

type JobsCreate = z.infer<typeof JobsUpdateSchema>;
type JobsUpdate = z.infer<typeof JobsUpdateSchema>;

interface CreateJobProps {
  afterSubmit: () => void;
}
interface UpdateJobProps {
  current: z.infer<typeof JobsResponseSchema>;
  afterSubmit: () => void;
}

export function CreateJob({ afterSubmit }: CreateJobProps) {
  const { mutateAsync } = useCreateJob();
  const form = useForm<JobsUpdate>({
    resolver: zodResolver(JobsUpdateSchema),
    defaultValues: { name: "" },
  });

  function onSubmit(values: JobsCreate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const shape = JobsUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <Button type="submit">Create Job</Button>
      </form>
    </Form>
  );
}

export function UpdateJob({ current, afterSubmit }: UpdateJobProps) {
  const { mutateAsync } = useUpdateJob(current.id);
  const form = useForm<JobsUpdate>({
    resolver: zodResolver(JobsUpdateSchema),
    defaultValues: {
      name: "",
    },
  });

  function onSubmit(values: JobsUpdate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const shape = JobsUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <Button type="submit">Create Job</Button>
      </form>
    </Form>
  );
}
