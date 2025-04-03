"use client";
import { Control, FieldValues, UseFormReturn } from "react-hook-form";
import { z } from "zod";
import {
  CodebookNodeCreateSchema,
  CodebookNodeSurveyPhaseSchema,
} from "@/app/api/projects/[projectId]/jobs/[jobId]/codebookNodes/schemas";
import { NameField } from "./jobBlockForms";

type CodebookNodeCreate = z.infer<typeof CodebookNodeCreateSchema>;

export function SurveyPhaseNodeForm<T extends FieldValues>({
  form,
  control,
}: {
  form: UseFormReturn<CodebookNodeCreate>;
  control: Control<T, any>;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[1fr,180px] items-end gap-2">
        <NameField form={form} />
      </div>
    </div>
  );
}
