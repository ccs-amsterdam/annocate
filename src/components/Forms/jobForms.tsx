"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form, FormItem, FormLabel } from "../ui/form";
import { TextFormField } from "./formHelpers";
import { JobsCreateSchema, JobsResponseSchema, JobsUpdateSchema } from "@/app/api/projects/[projectId]/jobs/schemas";
import { useCreateJob, useUpdateJob } from "@/app/api/projects/[projectId]/jobs/query";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import DBSelect from "../Common/DBSelect";
import { useCreateEmptyCodebook } from "./codebookForms";
import { useCodebooks } from "@/app/api/projects/[projectId]/codebooks/query";
import { useEffect, useState } from "react";
import { Input } from "../ui/input";
import { ChevronDown, Plus } from "lucide-react";

type JobsCreate = z.infer<typeof JobsCreateSchema>;
type JobsUpdate = z.infer<typeof JobsUpdateSchema>;

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
  const form = useForm<JobsCreate>({
    resolver: zodResolver(JobsCreateSchema),
    defaultValues: { name: "", codebookId: undefined },
  });

  function onSubmit(values: JobsCreate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const codebookId = form.watch("codebookId");
  const shape = JobsCreateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <div className="flex flex-col gap-2">
          <FormLabel>Codebook</FormLabel>
          <SelectCodebook
            projectId={projectId}
            onSelect={(id: number) => {
              form.setValue("codebookId", id, { shouldDirty: true });
            }}
          />
        </div>
        <Button type="submit">Create Job</Button>
      </form>
    </Form>
  );
}

export function UpdateJob({ projectId, current, afterSubmit }: UpdateJobProps) {
  const { mutateAsync } = useUpdateJob(projectId, current.id);
  const form = useForm<JobsUpdate>({
    resolver: zodResolver(JobsUpdateSchema),
    defaultValues: {
      name: "",
      codebookId: undefined,
    },
  });

  function onSubmit(values: JobsUpdate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const codebookId = form.watch("codebookId");
  const shape = JobsUpdateSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <TextFormField control={form.control} zType={shape.name} name="name" />
        <div>
          <FormLabel>Codebook</FormLabel>
          <SelectCodebook
            projectId={projectId}
            onSelect={(id: number) => form.setValue("codebookId", id, { shouldDirty: true })}
            current={current}
          />
        </div>
        <Button type="submit">Create Job</Button>
      </form>
    </Form>
  );
}

function SelectCodebook(props: {
  projectId: number;
  onSelect: (id: number) => void;
  current?: z.infer<typeof JobsResponseSchema>;
}) {
  const [selected, setSelected] = useState(props.current?.codebookName || "");
  const useCodebooksProps = useCodebooks(props.projectId);
  const [newName, setNewName] = useState("");
  const { create } = useCreateEmptyCodebook(props.projectId);

  useEffect(() => {
    if (props.current) {
      setSelected(props.current.codebookName);
    }
  }, [props.current]);

  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <Button variant="outline" className=" flex items-center justify-between gap-2 ">
          {selected || "Select Codebook"} <ChevronDown />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-w-72">
        <DBSelect
          {...useCodebooksProps}
          nameField={"name"}
          projectId={props.projectId}
          onSelect={(codebook) => {
            props.onSelect(codebook.id);
            setSelected(codebook.name);
          }}
        >
          <div className="flex items-center gap-2">
            <Input placeholder="New codebook" value={newName} onChange={(e) => setNewName(e.target.value)} />
            <Button
              disabled={!newName}
              className="ml-auto flex  w-min gap-1"
              variant="secondary"
              onClick={() =>
                create(newName).then(({ id }) => {
                  props.onSelect(id);
                  setSelected(newName);
                })
              }
            >
              <Plus />
            </Button>
          </div>
        </DBSelect>
      </PopoverContent>
    </Popover>
  );
}
