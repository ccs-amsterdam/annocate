"use client";

import { useUpdateProject, useCreateProject } from "@/app/api/projects/query";
import { ProjectsUpdateSchema, ProjectsResponseSchema } from "@/app/api/projects/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import { TextFormField } from "./formHelpers";

type JobsCreate = z.infer<typeof ProjectsUpdateSchema>;
type JobsUpdate = z.infer<typeof ProjectsUpdateSchema>;

interface CreateJobProps {
  afterSubmit: () => void;
}
interface UpdateJobProps {
  current: z.infer<typeof ProjectsResponseSchema>;
  afterSubmit: () => void;
}

export function CreateJob({ afterSubmit }: CreateJobProps) {
  const { mutateAsync } = useCreateProject();
  const form = useForm<JobsUpdate>({
    resolver: zodResolver(ProjectsUpdateSchema),
    defaultValues: { name: "" },
  });

  function onSubmit(values: JobsCreate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const shape = ProjectsUpdateSchema.shape;

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
  const { mutateAsync } = useUpdateProject(current.id);
  const form = useForm<JobsUpdate>({
    resolver: zodResolver(ProjectsUpdateSchema),
    defaultValues: {
      name: "",
    },
  });

  function onSubmit(values: JobsUpdate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const shape = ProjectsUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <Button type="submit">Create Job</Button>
      </form>
    </Form>
  );
}
