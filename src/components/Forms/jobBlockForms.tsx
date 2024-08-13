"use client";

import { useCreateJob, useCreateJobBlock, useUpdateJob } from "@/app/api/projects/[projectId]/jobs/query";
import {
  JobAnnotationBlockSchema,
  JobBlockCreateSchema,
  JobBlockResponseSchema,
  JobBlockUpdateSchema,
  JobCreateSchema,
  JobsResponseSchema,
  JobSurveyBlockSchema,
  JobUpdateSchema,
} from "@/app/api/projects/[projectId]/jobs/schemas";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import { TextFormField } from "./formHelpers";
import { JobBlock } from "@/app/types";
import { useEffect, useState } from "react";
import { useCodebooks } from "@/app/api/projects/[projectId]/codebooks/query";
import { useCreateEmptyCodebook } from "./codebookForms";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import DBSelect from "../Common/DBSelect";
import { ChevronDown, Plus } from "lucide-react";
import { Input } from "../ui/input";
import { Select } from "@radix-ui/themes";

type JobBlockCreate = z.infer<typeof JobBlockCreateSchema>;
type JobBlockUpdate = z.infer<typeof JobBlockUpdateSchema>;

interface CreatJobBlockProps {
  projectId: number;
  jobId: number;
  position: number;
  type: "survey" | "annotation";
  current?: JobBlock;
  afterSubmit: () => void;
}
interface UpdateJobBlockProps {
  projectId: number;
  jobId: number;
  position: number;
  current: JobBlock;
  afterSubmit: () => void;
}

export function CreateJobBlock({ projectId, jobId, type, position, current, afterSubmit }: CreatJobBlockProps) {
  const { mutateAsync } = useCreateJobBlock(projectId, jobId);
  const form = useForm<JobBlockCreate>({
    resolver: zodResolver(JobCreateSchema),
    defaultValues: defaultValues(type, position, current),
  });

  function onSubmit(values: JobBlockCreate) {
    mutateAsync(values).then(afterSubmit).catch(console.error);
  }

  const shape = type === "survey" ? JobSurveyBlockSchema.shape : JobAnnotationBlockSchema.shape;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
        <SelectCodebook projectId={projectId} onSelect={(id) => form.setValue("codebookId", id)} current={current} />
        <Button type="submit">Create {type} block</Button>
      </form>
    </Form>
  );
}

function SelectCodebook(props: { projectId: number; onSelect: (id: number) => void; current?: JobBlock }) {
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

function defaultValues(type: "survey" | "annotation", position: number, current?: JobBlock): JobBlockUpdate {
  if (type === "survey")
    return {
      type: "survey",
      position: current?.position || position,
    };
  if (type === "annotation")
    return {
      type: "annotation",
      position: current?.position || position,
      units: [],
      rules: current?.rules || { randomizeUnits: true },
    };
  throw new Error("Invalid type");
}

function createShape(type: "survey" | "annotation"): z.ZodType<Ta> {
  if (type === "survey") return JobAnnotationBlockSchema.shape;
  if (type === "annotation") return JobSurveyBlockSchema.shape;
  throw new Error("Invalid type");
}
