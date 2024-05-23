"use client";

import {
  jobRoleOptions,
  JobUsersResponseSchema,
  JobUsersCreateOrUpdateSchema,
} from "@/app/api/jobs/[jobId]/jobusers/schemas";

import { useCreateOrUpdateJobUser } from "@/app/api/jobs/[jobId]/jobusers/query";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import { RadioFormField, TextFormField } from "./formHelpers";

type JobUsersUpdateBody = z.infer<typeof JobUsersCreateOrUpdateSchema>;
type JobUsersCreateBody = z.infer<typeof JobUsersCreateOrUpdateSchema>;

interface CreateJobUserProps {
  jobId: number;
  afterSubmit: () => void;
}

interface UpdateJobUserProps {
  jobId: number;
  current: z.infer<typeof JobUsersResponseSchema>;
  afterSubmit: () => void;
}

export function CreateJobUser({ jobId, afterSubmit }: CreateJobUserProps) {
  const { mutateAsync } = useCreateOrUpdateJobUser(jobId);
  const form = useForm<JobUsersCreateBody>({
    resolver: zodResolver(JobUsersCreateOrUpdateSchema),
    defaultValues: {
      email: "",
      role: undefined,
    },
  });

  function onSubmit(values: JobUsersCreateBody) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  const shape = JobUsersCreateOrUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <TextFormField control={form.control} zType={shape.email} name="email" />
        <RadioFormField control={form.control} zType={shape.role} name="role" values={jobRoleOptions} />
        <Button type="submit">Create User</Button>
      </form>
    </Form>
  );
}

export function UpdateJobUser({ jobId, current, afterSubmit }: UpdateJobUserProps) {
  const { mutateAsync } = useCreateOrUpdateJobUser(jobId);
  const form = useForm<JobUsersUpdateBody>({
    resolver: zodResolver(JobUsersCreateOrUpdateSchema),
    defaultValues: JobUsersCreateOrUpdateSchema.parse(current),
  });

  function onSubmit(values: JobUsersUpdateBody) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }
  const shape = JobUsersCreateOrUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <RadioFormField control={form.control} zType={shape.role} name="role" values={jobRoleOptions} />
        <Button type="submit">Create User</Button>
      </form>
    </Form>
  );
}
