"use client";

import { useMutateJobs } from "@/app/api/jobs/query";
import { useMiddlecat } from "middlecat-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Input } from "../ui/input";
import { useForm } from "react-hook-form";
import { JobsPostBody, JobsPostBodySchema } from "@/app/api/jobs/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { Button } from "../ui/button";

interface CreateJobDialogProps {
  children?: React.ReactNode;
}

export function CreateJobDialog({ children }: CreateJobDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild className="flex">
        {children}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Job</DialogTitle>
        </DialogHeader>
        <CreateJob afterSubmit={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

interface CreateJobProps {
  afterSubmit: () => void;
}

export function CreateJob({ afterSubmit }: CreateJobProps) {
  const form = useForm<JobsPostBody>({
    resolver: zodResolver(JobsPostBodySchema),
    defaultValues: {
      title: "",
    },
  });
  const { mutateAsync } = useMutateJobs();

  function onSubmit(values: JobsPostBody) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="Job title" {...field} />
              </FormControl>
              <FormDescription>Pick a name. You can change this later</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Create Job</Button>
      </form>
    </Form>
  );
}
